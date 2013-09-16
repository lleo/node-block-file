// File: block_file.js
// By: LunaticLeo
// On: 12/13/2012
// Abstract: Library to read/write fixed size blocks.
"use strict";

//node.js built-ins
var fs = require('fs')
  , assert = require('assert')
  , util = require('util')
  , format = util.format

//dependencies
var u = require('lodash') //require('underscore')
  , async = require('async')
  , Stats = require('stats-api')
  , msgpack = require('msgpack-js')

//this package
var utils = require('./utils')
  , validateCRC = utils.validateCRC
  , signCRC     = utils.signCRC
  , validateCRC32 = utils.validateCRC32
  , signCRC32     = utils.signCRC32
  , Props = require('./props')
  , Handle = require('./handle')
  , NaiveFSM = require('./fsm_naive')
  , Segment = require('./segment')

//Setup library wide Stats NameSpace & Stats
var bfStats = Stats().createNameSpace("block-file")
bfStats.createStat("tt_store", Stats.TimerNS ) //tt_store => time to store
bfStats.createStat("tt_load", Stats.TimerNS ) //tt_load => time to load
bfStats.createStat("tt_store ravg", Stats.RunningAverage
                  , { stat: bfStats.get("tt_store") })
bfStats.createStat("tt_load ravg", Stats.RunningAverage
                  , { stat: bfStats.get("tt_load") })
bfStats.createHistogram("hog tt_store", "tt_store", Stats.semiLogNS)
bfStats.createHistogram("hog tt_load", "tt_load", Stats.semiLogNS)

bfStats.createStat('fs.read', Stats.Value, {units:"bytes"})
bfStats.createStat('fs.write', Stats.Value, {units:"bytes"})
bfStats.createHOG('hog fs.read', 'fs.read', Stats.semiBytes)
bfStats.createHOG('hog fs.write', 'fs.write', Stats.semiBytes)
bfStats.createHOG('hog KB fs.read', 'fs.read', Stats.linearKB)
bfStats.createHOG('hog KB fs.write', 'fs.write', Stats.linearKB)

bfStats.createStat('load_cnt', Stats.Count, {stat: bfStats.get('tt_load')})
bfStats.createStat('store_cnt', Stats.Count, {stat: bfStats.get('tt_store')})

BlockFile.STATS = bfStats

//Exported BlockFile constants
var MD_MAP = {
  'crc32 value'        : 0  //32bits; different from metaProps.checkSumBits
                            //  metaProps.checkSumBits is for FSM checksums
, 'number of segments' : 4  //DoubleBE; we are only using it for 53 integer
                            //  bits. It's the only way we can handle
                            //  metaProps.segNumBits ?! for numHandleBits == 64
, 'metaPropsLen'       : 12 //UInt16BE
, 'appDataLen'         : 14 //UInt16BE
, 'END_FIXED'          : 16
}

BlockFile.MD_MAP = MD_MAP

var MD_BLOCKSIZE        = BlockFile.MD_BLOCKSIZE = 4096
  , MD_HDRSIZE          = BlockFile.MD_HDRSIZE = 2 * MD_BLOCKSIZE
  , MD_OFFSET_PRIMARY   = BlockFile.MD_OFFSET_PRIMARY = 0
  , MD_OFFSET_SECONDARY = BlockFile.MD_OFFSET_SECONDARY = MD_BLOCKSIZE


/**
 * BlockFile constructor
 *
 * @param {String} filename
 * @param {Number} fd file descriptor from fs.open
 * @param {Props} [props]
 */
exports = module.exports = BlockFile
function BlockFile(filename, fd, mdBuf,  props) {
  this.props = props || Props.defaultProps

  this.filename = filename

  this.fd = fd

  this.mdBuf = mdBuf

  this.fsmType = NaiveFSM

  this.segments = [] //indexed by segment number
}

//re-export basic objects
//
BlockFile.BlockFile = BlockFile
BlockFile.Handle = Handle
BlockFile.Props = Props

/** Create a BlockFile
 *
 * @param {String} filename
 * @param {Props} [props]
 * @param {Function} createcb Callback (err, bf)
 */
BlockFile.create = function(filename, metaProps_, createcb){
  if (typeof createcb == 'undefined' && typeof metaProps_ == 'function') {
//  if (arguments.length == 2) {
    createcb = metaProps_
    metaProps_ = {}
  }

  assert( u.isPlainObject(metaProps_)
        , "metaProps argument is not a plain object")

  var metaProps = u.defaults( u.clone(metaProps_)
                            , Props.defaultProps.metaProps())

  Props.assertValidMetaProps(metaProps)

  // Construct the BlockFile metadata block
  //
  var mdBuf = new Buffer(MD_BLOCKSIZE)
    , crcValue, mode, fd, bf

  mdBuf.fill(0) //fill whole buffer with zeroes

  // 'number of segments'
  //
  var numSeg = 0
  mdBuf.writeDoubleBE(numSeg, MD_MAP['number of segments'])


  // metaProps & appData
  //

  var metaPropsBuf = msgpack.encode(metaProps)
    , appDataBuf = new Buffer(0) //no appData at first
    , mdBufAvail = mdBuf.length - MD_MAP['END_FIXED']
    , metaPropsOff = MD_MAP['END_FIXED']
    , appDataOff = MD_MAP['END_FIXED'] + metaPropsBuf.length

  mdBuf.writeUInt16BE(metaPropsBuf.length, MD_MAP['metaPropsLen'])
  metaPropsBuf.copy(mdBuf, metaPropsOff)

  mdBufAvail -= metaPropsBuf.length

  if (mdBufAvail < appDataBuf.length) {
    createcb(new Error(
      format( "BlockFile.create: mdBufAvail < appDataBuf.length; %d < %d"
            , mdBufAvail, appDataBuf.length )
    ))
  }

  mdBuf.writeUInt16BE(appDataBuf.length, MD_MAP['appDataLen'])
  appDataBuf.copy(mdBuf, appDataOff)

  mdBufAvail -= metaPropsBuf.length //not really necessary, but ... whatever!

  //MUST BE last write
  // file header checksum
  signCRC32(mdBuf, MD_MAP['crc32 value'])

  mode = 420 //Octal: 0644; octals not allowed in strict mode

  async.waterfall(
    [
      function(cb) {
        //open in write & exclusive mode; ie errors out if file exists
        fs.open(filename, 'wx+', mode, cb)
      }

      // callback from fs.open is cb(err, fd)
    , function(fd_, cb) {
        fd = fd_
        // write header primary
        fs.write( fd
                , mdBuf         /*buffer*/
                , 0             /*buffer offset*/
                , mdBuf.length  /*number of bytes to read*/
                , MD_OFFSET_PRIMARY /*file position*/
                , cb )
      }

      // callback from fs.write is cb(err, written, buffer)
    , function(bytesWritten, buffer, cb) {
        // write header backup
        fs.write( fd
                , mdBuf         /*buffer*/
                , 0             /*buffer offset*/
                , mdBuf.length  /*number of bytes to read*/
                , MD_OFFSET_SECONDARY /*file position*/
                , cb )
      }

      // callback from fs.write is cb(err, written, buffer)
    , function(written, buffer, cb) {
        fs.close(fd, cb)
      }

      // call back from fs.close is cb(err)
    , function(cb) {
        BlockFile.open(filename, metaProps, cb)
      }
    ],

    // callback from fs.close is cb(err) or error in waterfall
    createcb
  )
} //BockFile.create()


/** Open a BlockFile
 *
 * @param {String} filename
 * @param {Props} [props] in case we end up creating the file.
 * @param {Function} opencb opencb(err, bf)
 */
BlockFile.open = function(filename, metaProps, opencb){
  if (typeof opencb == 'undefined' && typeof metaProps == 'function') {
//  if (arguments.length == 2) {
    opencb = metaProps
    metaProps = undefined
    //props = undefined
  }

  metaProps = u.defaults(u.clone(metaProps||{}), Props.defaultProps.metaProps())

  var stat, fd, bf
    , mdBuf = new Buffer(MD_BLOCKSIZE)
    , passed

  mdBuf.fill(0)

  assert.ok(typeof filename === 'string', "filename not a function")
  assert.ok(typeof opencb === 'function', "opencb not a function")

  async.waterfall(
    [
      // stat(filename, ...)
      function(cb) {
        fs.stat(filename, function(err, stat) {
          if (err && err.code === 'ENOENT') {
            BlockFile.create(filename, metaProps, function(err) {
              if (err) {
                cb(err)
                return
              }
              fs.stat(filename, cb)
            })
            return
          }
          cb(null, stat)
        })
      }
    , function(stat_, cb) {
        stat = stat_

        if (!stat.isFile()) { // filname is not a regular file
          cb(new Error("file, "+filename+", is not at regular file."))
          return /* no fall thru */
        }

        if (stat.size < MD_HDRSIZE) {
          cb(new Error(format("file, %s, is not big enough to hold the metadata header blocks; %d < %d", filename, stat.size, MD_HDRSIZE)))
          return
        }

        fs.open(filename, 'r+', cb)
      }
    , function(fd_, cb) {
        fd = fd_

        //read PRIMARY file metadata block
        fs.read( fd
               , mdBuf         /*buffer*/
               , 0             /*buffer offset*/
               , mdBuf.length  /*number of bytes to read*/
               , MD_OFFSET_PRIMARY  /*file position*/
               , cb )
      }
    , function(bytesRead, buffer, cb) {
        if ( !validateCRC32(buffer, MD_MAP['crc32 value']) ) {
          passed = false
          //read SECONDARY file metadata block
          fs.read( fd
                 , buffer         /*buffer*/
                 , 0              /*buffer offset*/
                 , buffer.length  /*number of bytes to read*/
                 , MD_OFFSET_SECONDARY  /*file position*/
                 , cb )
          return
        }
        passed = true
        cb(null, bytesRead, buffer)
      }
    , function(bytesRead, buffer, cb){
        if (passed) {
          cb(null, bytesRead, buffer);
          return
        }
        if (!validateCRC32(self.buffer, MD_MAP['crc32 value'])) {
          //PRIMARY & SECONDARY are invalid
          cb(new Error("PRIMARY & SECONDARY file header blocks are invalid"))
          return
        }
        //SECONDARY good, need to fix PRIMARY
        fs.write( fd
                , buffer
                , 0
                , buffer.length
                , MD_OFFSET_PRIMARY
                , cb )
      }
    , function(bytesWritten, buffer, cb){
        //read metaProps & construct props
        var metaPropsLen, metaPropsBuf, metaProps, props

        metaPropsLen = buffer.readUInt16BE(MD_MAP['metaPropsLen'])
        metaPropsBuf = buffer.slice( MD_MAP['END_FIXED']
                                   , MD_MAP['END_FIXED']+metaPropsLen)

        metaProps = msgpack.decode(metaPropsBuf)
        props = new Props(metaProps)

        // new BlockFile && initialize
        bf = new BlockFile(filename, fd, mdBuf, props)
        bf.initialize(stat, cb)
      }
    ],
    /* BlockFile__initialized: called with (err) arguments */
    opencb
  )
} //BlockFile.open()


/** Initialize BlockFile object ex. read in segments
 *
 * @param {fs.Stats} stat the fstat of the file to initialize
 * @param {Function} initcb initcb(err, bf)
 */
BlockFile.prototype.initialize = function(stat, initcb){
  assert.ok(stat instanceof fs.Stats)
  var self = this
    , fileSize, calcNumSegs, errStr, err

  fileSize = stat.size

  if (fileSize < MD_HDRSIZE ) {
    errStr = format( "file size(%d) bigger than file header size(%d)"
                   , fileSize, MD_HDRSIZE )
    initcb(new Error(errStr))
    return
  }

  fileSize -= MD_HDRSIZE
  //calculate number of segments from filesize
  calcNumSegs = Math.ceil( fileSize / this.props.maxSegSize() )
  if (!(calcNumSegs == 0 || Handle.isValidSegNum(calcNumSegs-1, this.props))) {
    err = new Error(format("Invalid calculated number of Segments %d"
                          , calcNumSegs))
    initcb(err)
    return
  }

  var fileNumSegs, segNum=0

  fileNumSegs = this.mdBuf.readDoubleBE(MD_MAP['number of segments'])

  if (!(fileNumSegs === 0 || Handle.isValidSegNum(fileNumSegs-1, this.props))) {
    err = new Error(format("Invalid 'number of segments' %d", fileNumSegs))
    initcb(err)
    return
  }

  //for 0..segment number -1
  //  read segment
  async.whilst(
    /* test */
    function(){ return segNum < fileNumSegs }
    /* body */
  , function(untilcb){
      self._readSegment(segNum, untilcb)
      segNum += 1
    }
    /* finished or err */
  , function(err){
      initcb(err, self)
    }
  )
} //.initialize()


/**
 * Retrieve the Buffer for AppData from the MetaData Buffer
 *
 * @return {Buffer} AppData Buffer
 */
BlockFile.prototype.getAppData = function(){
  var metaPropsLen = this.mdBuf.readUInt16BE(MD_MAP['metaPropsLen'])
    , appDataLen   = this.mdBuf.readUInt16BE(MD_MAP['appDataLen'])
    , avail = MD_BLOCKSIZE - MD_MAP['END_FIXED'] - metaPropsLen

  if ( MD_MAP['END_FIXED'] + metaPropsLen + appDataLen > MD_BLOCKSIZE ) {
    throw new Error(
      format( "BlockFile#setAppData: MD_MAP['END_FIXED'] + metaPropsLen + appDataLen < MD_BLOCKSIZE; %d + %d + %d > %d"
            , MD_MAP['END_FIXED'], metaPropsLen, appDataLen, MD_BLOCKSIZE) )
  }

  var start = MD_MAP['END_FIXED'] + metaPropsLen
    , end = start + appDataLen
    , appDataBuf = this.mdBuf.slice(start, end)

  return appDataBuf
}


/**
 * Set the AppData in the MetaData Buffer
 *
 * @param {Buffer} appDataBuf
 * @return {Boolean}
 */
BlockFile.prototype.setAppData = function(appDataBuf, cb){
  var metaPropsLen = this.mdBuf.readUInt16BE(MD_MAP['metaPropsLen'])
    , avail = MD_BLOCKSIZE - MD_MAP['END_FIXED'] - metaPropsLen

  if (appDataBuf.length > Math.pow(2,16)) {
    throw new Error(
      format( "BlockFile#setAppData: app data buffer > UInt16; %d > %d"
            , appDataBuf.length, Math.pow(2,16) ) )
  }

  if (avail < appDataBuf.length) {
    throw new Error(
      format( "BlockFile#setAppData: available space < app data; %d < %d"
            , avail, appDataBuf.length ) )
  }

  this.mdBuf.writeUInt16BE(appDataBuf.length, MD_MAP['appDataLen'])

  var appDataOff = MD_MAP['END_FIXED'] + metaPropsLen

  appDataBuf.copy( this.mdBuf, appDataOff )
}


/**
 * Write out all segment and block file metadata.
 *
 * @param {Function} cb cb(err)
 */
BlockFile.prototype.flush = function(cb){
  var self = this

//  console.warn("BlockFile#flush: called!")
  async.series( [ function(scb){ self.writeSegments(scb) }
                , function(scb){ self.writeHeader(scb)   }
                , function(scb){ fs.fsync(self.fd, scb)  } ]
              , function(err, res){ if (err) cb(err); else cb(null) })
}

/**
 * Close out BlockFile resources. eg .fd
 *
 * @param {Function} cb cb(err)
 */
BlockFile.prototype.close = function(cb){
  var self = this

  this.flush(function(err){
    if (err) { cb(err); return }
    fs.close( self.fd, cb )
  })

} //.close()


/**
 * Write BlockFile Header
 *
 * @param {Function} cb cb(err)
 */
BlockFile.prototype.writeHeader = function(cb){
  var self = this

  var numSeg = self.segments.length
  this.mdBuf.writeDoubleBE(numSeg, MD_MAP['number of segments'])

  //not re-writing metaProps; should be preserved.

  //MUST BE last write
  // file header checksum
  signCRC32(this.mdBuf, MD_MAP['crc32 value'])

  async.series(
    [
      function(scb){
        fs.write( self.fd
                , self.mdBuf         /*buffer*/
                , 0                  /*buffer offset*/
                , self.mdBuf.length  /*number of bytes to read*/
                , MD_OFFSET_PRIMARY /*file position*/
                , scb )
      }
    , function(scb){
        fs.write( self.fd
                , self.mdBuf         /*buffer*/
                , 0                  /*buffer offset*/
                , self.mdBuf.length  /*number of bytes to read*/
                , MD_OFFSET_SECONDARY /*file position*/
                , scb )
      }
    ]
  , function(err, res){ if (err) cb(err); else cb() })
} //.writeHeader()


/** Create/append a new Segment
 *
 * @return {Number} New setment number
 */
BlockFile.prototype.addSegment = function(){
  var self = this
    , nextSegNum = self.segments.length
    , buffer = new Buffer(this.props.fsmSize())

  buffer.fill(0xff) //completely empty

  this.segments.push( new Segment(nextSegNum, buffer, this.fsmType, this.props) )

  return nextSegNum
} //.addSegment()


BlockFile.prototype._calcSegOff = function(segNum){
  return MD_HDRSIZE + ( segNum * this.props.maxSegSize() )
}


BlockFile.prototype._calcBlkOff = function(segNum, blkNum){
  return this._calcSegOff(segNum) +
    this.props.segHdrSize() +
    (blkNum * this.props.blockSize())
}


/** Read in a new Segment
 *
 * @param {Number} segNum
 * @param {Function} cb Callback (err, segment, segNum)
 */
BlockFile.prototype._readSegment = function(segNum, cb){
  var self = this
    , seg, fsmOff, fsmBuf

  function finish(err, buffer) {
    if (err) {
      cb(err)
      return
    }

    self.segments[segNum] = new Segment(segNum, buffer, self.fsmType, self.props)

    cb(null, self.segments[segNum])
  } //finish()

  fsmBuf = new Buffer(this.props.fsmSize())
  async.waterfall(
    [
      //read PRIMARY FSM
      function(wfcb){
        var fsmOff = self._calcSegOff(segNum) + self.props.fsmOffsetPrimary()
        fs.read( self.fd
         , fsmBuf         /*buffer*/
         , 0              /*buffer offset*/
         , fsmBuf.length  /*number of bytes to read*/
         , fsmOff         /*file position*/
         , wfcb )
      }
      //validate xor read BACKUP FSM
    , function(bRead, buffer, wfcb) {
        if ( !validateCRC(buffer, self.props) ) {
          var fsmOff = self._calcSegOff(segNum) + self.props.fsmOffsetSecondary()
          fs.read( self.fd
                 , fsmBuf         /*buffer*/
                 , 0              /*buffer offset*/
                 , fsmBuf.length  /*number of bytes to read*/
                 , fsmOff         /*file position*/
                 , wfcb )
          return
        }
        finish(null, buffer)
      }
      // validate BACKUP and write PRIMARY
    , function(bRead, buffer, wfcb) {
        if ( !validateCRC(buffer, self.props) ) {
          wfcb( new Error(format("PRIMARY & BACKUP FSM for Segment %d inavalid", segNum)) )
          return
        }
        var fsmOff = self._calcSegOff(segNum) + self.props.fsmOffsetPrimary()
        fs.write( self.fd
                 , buffer         /*buffer*/
                 , 0              /*buffer offset*/
                 , buffer.length  /*number of bytes to read*/
                 , fsmOff         /*file position*/
                 , wfcb )
      }
    ],
    //written
    function(err, bWrit, buffer, wfcb) {
        finish(err, buffer)
    }
  )
} //._readSegment()


/**
 * Write out a Segment free space bitmap to the block file.
 *
 * @param {Number} segNum
 * @param {Function} cb Callback (err)
 */
BlockFile.prototype._writeSegment = function(segNum, cb){
  var self = this
    , seg = this.segments[segNum]


  //seg.sign()
  signCRC(seg.buffer, this.props)

  async.waterfall(
    [ //write PRIMARY
      function(wfcb){
        var fsmOff = self._calcSegOff(segNum) + self.props.fsmOffsetPrimary()
        fs.write( self.fd
                , seg.buffer
                , 0
                , seg.buffer.length
                , fsmOff
                , wfcb)
      }
      //write BACKUP
    , function(bWrit, buffer, wfcb){
        var fsmOff = self._calcSegOff(segNum) + self.props.fsmOffsetSecondary()
        fs.write( self.fd
                , seg.buffer
                , 0
                , seg.buffer.length
                , fsmOff
                , wfcb)
      }
    ]
  , function(err, bWrit, buffer){
      if (err) { cb(err); return }
      cb(null)
    })
} //._writeSegment()


/**
 * Write all dirty segments in reverse order.
 *
 * @param {Function} [cb] cb(err)
 */
BlockFile.prototype.writeSegments = function(cb){
  var self = this

//  cb = cb || function(){}

  var segs = u.filter(self.segments, function(seg){ return seg.dirty })
             .reverse()

  async.mapSeries( segs
                 , function(seg, cb){ self._writeSegment(seg.segNum, cb) }
                 , function(err, res){ if (err) cb(err); else cb() } )
} //.writeSegments()


/**
 * Release blocks, described by hdl, from BlockFile
 *
 * @param {Handle} hdl
 * @return {undefined}
 * @throws {InvalidHandleError} when hdl is not a allocated span of blocks in the givens segment.
 */
BlockFile.prototype.release = function(hdl){

  var seg = this.segments[hdl.segNum]

  var ok = seg.release(hdl)

  return ok
} //.release()


/**
 * Reserve a number of blocks into a Handle
 *
 * @param {Number} numBlks
 * @return {Handle}
 */
BlockFile.prototype.reserve = function(numBlks){
  var len, hdl, segNum

  len = this.segments.length
  for (segNum = 0; segNum < len; segNum += 1) {
    hdl = this.segments[segNum].reserve( numBlks )
    if ( !u.isUndefined(hdl) ) break
  }
  if ( segNum === len ) { //hdl not found
    this.addSegment()
    hdl = this.segments[segNum].reserve( numBlks )
  }

  return hdl
} //.reserve()


/**
 * Load block buffer from BlockFile described by hdl
 *
 * @param {Handle} hdl Handle object describes where to write buffer
 * @param {Function} cb Callback (err, buffer)
 */
BlockFile.prototype.load = function(hdl, cb){
  var buffer = new Buffer(this.props.blockSize() * (1+hdl.spanNum))
    , blkOff = this._calcBlkOff(hdl.segNum, hdl.blkNum)
    , doneNS = bfStats.get("tt_load").start()

  bfStats.get('load_cnt').inc()

  fs.read( this.fd
         , buffer         /*buffer*/
         , 0              /*buffer position*/
         , buffer.length  /*number of bytes to read*/
         , blkOff         /*file position*/
         , function(err, bRead, buf){
             if (err) { cb(err); return }
             doneNS()
             bfStats.get('fs.read').set(bRead)
             cb(null, buf)
           } )
} //.load()


/**
 * Store block buffer copy-on-write semantics
 *
 * @param {Buffer} buffer Buffer object that is written to hdl location
 * @param {Function} cb Callback (err, handle)
 * //@return {Handle}
 */
BlockFile.prototype.store = function(buffer, hdl, cb){
  var numBlks
    , blkOff
    , doneNS = bfStats.get("tt_store").start()

  bfStats.get('store_cnt').inc()

  if (typeof hdl === 'function') {
    cb = hdl
    hdl = undefined
  }
  //hdl == null covers null and undefined
  if ( hdl == null || hdl.size() < buffer.length) {
    numBlks = Math.ceil( buffer.length / this.props.blockSize() )
    hdl = this.reserve(numBlks)
  }

  blkOff = this._calcBlkOff(hdl.segNum, hdl.blkNum)
  fs.write( this.fd
          , buffer
          , 0             /*buffer position*/
          , buffer.length /*number of bytes*/
          , blkOff        /*file position*/
          , function(err, bytesWritten, buf){
              if (err) { cb(err); return }
              doneNS() //ns timing
              bfStats.get('fs.write').set(bytesWritten)
              cb(null, hdl)
            }
          )

  //return hdl
} //.store()


//THE END