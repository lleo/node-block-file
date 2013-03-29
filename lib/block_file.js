// File: block_layer.js
// By: LunaticLeo
// On: 12/13/2012
// Abstract: Library to read/write fixed size blocks.

var fs = require('fs')
  , assert = require('assert')
  , u = require('lodash') //require('underscore')
  , async = require('async')
  , util = require('util')
  , format = util.format
  , utils = require('./utils')
  , validateCRC16 = utils.validateCRC16
  , validateCRC32 = utils.validateCRC32
  , signCRC16     = utils.signCRC16
  , signCRC32     = utils.signCRC32
  , Props = require('./props')
  , Handle = require('./handle')
  , NaiveFSM = require('./fsm_naive')
  , Segment = require('./segment')
  , constants = require('./constants')
//  , winston = require('winston')
//  , log = winston

//Exported BlockFile constants
BlockFile.MD_MAP = {
  'crc16 value'        : 0
, 'number of segments' : 2
}


/**
 * BlockFile constructor
 *
 * @param {string} filename
 * @param {number} fd file descriptor from fs.open
 * @param {Props} [props]
 */
exports = module.exports = BlockFile
function BlockFile(filename, fd, props) {
  this.props = props || Props.defaultProps

  this.filename = filename

  this.fd = fd

  this.fsmType = NaiveFSM

  this.fsm = undefined //this.initialize will `new fsmType(buffer)` this

  this.segments = [] //indexed by segment number
}

//re-export basic objects
//
BlockFile.BlockFile = BlockFile
BlockFile.Handle = Handle

//BlockFile.updateProps = function(){
//  var map =  Object.freeze({ 'crc16 value'        : 0
//                           , 'number of segments' : 2 })
//
//  Object.defineProperties(
//    BlockFile,
//    { BLOCK_SIZE:
//      { value: props.blockSize
//      , enumerable: true
//      , configurable: true }
//    , MD_OFFSET_PRIMARY:
//      { value: 0
//      , enumerable: true
//      , configurable: true }
//    , MD_OFFSET_BACKUP:
//      { value: props.blockSize
//      , enumerable: true
//      , configurable: true }
//    , MD_MAP:
//      { value: map
//      , enumerable: true
//      , configurable: true }
//    , FILE_HDR_SIZE:
//      { value: props.fileHdrSize
//      , enumerable: true
//      , configurable: true }
//    , MAX_FILE_SIZE:
//      { value: props.fileHdrSize + props.maxSegSize*props.numSegNums
//      , enumerable: true
//      , configurable: true }
//    })
//}
//
//props.on('changed', BlockFile.updateProps)
//
//BlockFile.updateProps()


/** Create a BlockFile
 *
 * @param {string} filename
 * @param {Props} [props]
 * @param {function} createcb Callback (err, bf)
 */
BlockFile.create = BlockFile_create
function BlockFile_create(filename, props, createcb) {
//  if (typeof props === 'function') {
  if (arguments.length == 2) {
    createcb = props
    props = Props.defaultProps
  }


  var mdBuf = new Buffer(props.blockSize)
    , crcValue, mode, fd, bf

  mdBuf.fill(0) //fill whole buffer with zeroes

  // number of segments
  var numSeg = 0
  mdBuf.writeUInt16BE(numSeg, BlockFile.MD_MAP['number of segments'])

  mode = 0644

  //MUST BE last write
  // file header checksum
  signCRC16(mdBuf)

  async.waterfall(
    [
      function(cb) {
        //open in write & exclusive mode; ie errors out if file exists
        fs.open(filename, 'wx', mode, cb)
      }

      // callback from fs.open is cb(err, fd)
    , function(fd_, cb) {
        fd = fd_
        // write header primary
        fs.write( fd
                , mdBuf             /*buffer*/
                , 0                 /*buffer offset*/
                , mdBuf.length      /*number of bytes to read*/
                , props.mdOffsetPrimary /*file position*/
                , cb )
      }

      // callback from fs.write is cb(err, written, buffer)
    , function(written, buffer, cb) {
        // write header backup
        fs.write( fd
                , mdBuf            /*buffer*/
                , 0                /*buffer offset*/
                , mdBuf.length     /*number of bytes to read*/
                , props.mdOffsetSecondary /*file position*/
                , cb )
      }

      // callback from fs.write is cb(err, written, buffer)
    , function(written, buffer, cb) {
        fs.close(fd, cb)
      }

      // call back from fs.close is cb(err)
    , function(cb) {
        BlockFile.open(filename, cb)
      }
    ],

    // callback from fs.close is cb(err) or error in waterfall
    createcb
  )
} //BockFile__create()


/** Open a BlockFile
 *
 * @param {string} filename
 * @param {Props} [props] in case we end up creating the file.
 * @param {function} opencb opencb(err)
 */
BlockFile.open = BlockFile_open
function BlockFile_open(filename, props, opencb) {
//  if (typeof props === 'function') {
  if (arguments.length == 2) {
    opencb = props
    props = Props.defaultProps
  }

  var args = Array.prototype.slice.call(arguments)
    , stat, bf

  if (args.length < 1 || args.length > 2)
    throw new Error(format("wrong number of open() args %d", args.length))

  assert.ok(typeof filename === 'string')
  assert.ok(typeof opencb === 'function')

  async.waterfall(
    [
      // stat(filename, ...)
      function(cb) {
        fs.stat(filename, function(err, stat) {
          if (err && err.code === 'ENOENT') {
            BlockFile.create(filename, props, function(err) {
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

        fs.open(filename, 'r+', cb)
      }
    , function(fd, cb) {
        // new BlockFile && initialize
        bf = new BlockFile(filename, fd)
        bf.initialize(cb, stat)
      }
    ],
    /* BlockFile__initialized: called with (err) arguments */
    opencb
  )
} //BlockFile__open()


/** Initialize BlockFile object ex. read in segments
 *
 * @param {function} initcb initcb(err, bf)
 */
BlockFile.prototype.initialize = BlockFile__initialize
function BlockFile__initialize(initcb, stat) {
  var self = this
    , calcNumSegs

  async.waterfall(
    [
      function(wfcb) {
        if (stat instanceof fs.Stats)
          wfcb(null, stat)
        else
          fs.fstat(self.fd, wfcb)
      }
    , function(stat_, wfcb) {
        var fileSize, calcNumSegs, errStr
        stat = stat_

        fileSize = stat.size

        if (fileSize < self.props.fileHdrSize ) {
          errStr = format( "file size(%d) bigger than file header size(%d)"
                         , fileSize, self.props.fileHdrSize )
          wfcb(new Error(errStr))
          return
        }

        fileSize -= self.props.fileHdrSize

        //calculate number of segments from filesize
        calcNumSegs = Math.ceil( fileSize / self.props.maxSegSize )
        if (!(calcNumSegs == 0 || Handle.isValidSegNum(calcNumSegs-1))) {
          wfcb(new Error(format("Invalid calculated number of Segments %d", calcNumSegs)))
          return
        }

        self.buffer = new Buffer(self.props.blockSize)

        async.waterfall(
          [
            function(lwfcb){
              //read PRIMARY file metadata block
              fs.read( self.fd
                     , self.buffer         /*buffer*/
                     , 0                   /*buffer offset*/
                     , self.buffer.length  /*number of bytes to read*/
                     , self.props.mdOffsetPrimary  /*file position*/
                     , lwfcb )
            }
          , function(bytesRead, buffer, lwfcb){
              if ( !validateCRC16(self.buffer) ) {
                //read BACKUP file metadata block
                fs.read( self.fd
                       , self.buffer         /*buffer*/
                       , 0                   /*buffer offset*/
                       , self.buffer.length  /*number of bytes to read*/
                       , self.props.mdOffsetSecondary  /*file position*/
                       , lwfcb )
                return
              }
              wfcb(null, bytesRead, buffer)
            }
          , function(bytesRead, buffer, lwfcb){
              if ( !validateCRC16(self.buffer) ) {
                //PRIMARY & BACKUP are invalid
                throw new Error("PRIMARY & BACKUP file header blocks are invalid")
                return
              }
              fs.write( self.fd
                      , self.buffer         /*buffer*/
                      , 0                   /*buffer offset*/
                      , self.buffer.length  /*number of bytes to write*/
                      , self.props.mdOffsetPrimary  /*file position*/
                      , lwfcb )
            }
          ]
        , function(err, written, buffer){ wfcb(err, written, buffer) } )
      }
    , function(bytesRead, buffer, wfcb) { //return from fs.read or fs.write
        var fileNumSegs, segNum=0

        fileNumSegs = buffer.readUInt16BE(BlockFile.MD_MAP['number of segments'])

        if ( !(fileNumSegs === 0 || Handle.isValidSegNum(fileNumSegs-1)) ) {
          wfcb(new Error(format("Invalid 'number of segments' %d", fileNumSegs)))
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
            wfcb(err, self)
          }
        )
      }
    ]
  , initcb)
} //BlockFile__initialize()


/**
 * Close out BlockFile resources. eg .fd
 *
 * @param {function} cb cb(err)
 */
BlockFile.prototype.close = BlockFile__close
function BlockFile__close(cb) {
  var self = this

  async.series( [ function(scb) { self.writeSegments(scb) }
                , function(scb) { self.writeHeader(scb) }
                , function(scb) { fs.close(self.fd, scb) } ]
              , function(err, res){ if (err) cb(err); else cb() } )
} //BlockFile__close()


/**
 * Write BlockFile Header
 *
 * @param {function} cb cb(err)
 */
BlockFile.prototype.writeHeader = BlockFile__writeHeader
function BlockFile__writeHeader(cb) {
  var self = this
    , mdBuf = new Buffer(this.props.blockSize)

  mdBuf.fill(0)
  var numSeg = self.segments.length
  mdBuf.writeUInt16BE(numSeg, BlockFile.MD_MAP['number of segments'])

  //MUST BE last write
  // file header checksum
  signCRC16(mdBuf)

  async.series(
    [
      function(scb){
        fs.write( self.fd
                , mdBuf             /*buffer*/
                , 0                 /*buffer offset*/
                , mdBuf.length      /*number of bytes to read*/
                , self.props.mdOffsetPrimary /*file position*/
                , scb )
      }
    , function(scb){
        fs.write( self.fd
                , mdBuf            /*buffer*/
                , 0                /*buffer offset*/
                , mdBuf.length     /*number of bytes to read*/
                , self.props.mdOffsetSecondary /*file position*/
                , scb )
      }
    ]
  , function(err, res){ if (err) cb(err); else cb() })
} //BlockFile__writeHeader()


/** Create/append a new Segment
 *
 * @returns {number} New setment number
 */
BlockFile.prototype.addSegment = BlockFile__addSegment
function BlockFile__addSegment() {
  var self = this
    , nextSegNum = self.segments.length
    , buffer = new Buffer(this.props.blockSize)

  //log.info("addSegment called nextSegNum="+nextSegNum)

  buffer.fill(0xff) //completely empty

  this.segments.push( new Segment(nextSegNum, buffer, this.fsmType) )

  return nextSegNum
} //BlockFile__addSegment()


BlockFile.prototype._calcSegOff = function(segNum) {
  return this.props.fileHdrSize + ( segNum * this.props.maxSegSize )
}


BlockFile.prototype._calcBlkOff = function(segNum, blkNum) {
  return this._calcSegOff(segNum) +
    this.props.segHdrSize +
    (blkNum * this.props.blockSize)
}


/** Read in a new Segment
 *
 * @param {number} segNum
 * @param {Function} cb Callback (err, segment, segNum)
 */
BlockFile.prototype._readSegment = BlockFile__readSegment
function BlockFile__readSegment(segNum, cb) {
  var self = this
    , seg, fsmOff, fsmBuf

  function finish(err, buffer) {
    if (err) {
      cb(err)
      return
    }

    self.segments[segNum] = new Segment(segNum, buffer, self.fsmType)

    cb(null, self.segments[segNum])
  } //finish()

  fsmBuf = new Buffer(this.props.fsmSize)
  async.waterfall(
    [
      //read PRIMARY FSM
      function(wfcb){
        var fsmOff = self._calcSegOff(segNum) + self.props.fsmOffsetPrimary
        fs.read( self.fd
         , fsmBuf         /*buffer*/
         , 0              /*buffer offset*/
         , fsmBuf.length  /*number of bytes to read*/
         , fsmOff         /*file position*/
         , wfcb )
      }
      //validate xor read BACKUP FSM
    , function(bRead, buffer, wfcb) {
        if ( !self.validate(buffer) ) {
          var fsmOff = self._calcSegOff(segNum) + self.props.fsmOffsetBackup
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
        if ( !self.validate(buffer) ) {
          wfcb( new Error("PRIMARY & BACKUP FSM inavalid") )
          return
        }
        var fsmOff = self._calcSegOff(segNum) + self.props.fsmOffsetPrimary
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
} //BlockFile__readSegment()


/**
 * Write out a Segment free space bitmap to the block file.
 *
 * @param {number} segNum
 * @param {Function} cb Callback (err)
 */
BlockFile.prototype._writeSegment = BlockFile___writeSegment
function BlockFile___writeSegment(segNum, cb) {
  var self = this
    , seg = this.segments[segNum]


  //this.sign(seg.buffer)
  seg.sign()

  async.waterfall(
    [ //write PRIMARY
      function(wfcb){
        var fsmOff = self._calcSegOff(segNum) + self.props.fsmOffsetPrimary
        fs.write( self.fd
                , seg.buffer
                , 0
                , seg.buffer.length
                , fsmOff
                , wfcb)
      }
      //write BACKUP
    , function(bWrit, buffer, wfcb){
        var fsmOff = self._calcSegOff(segNum) + self.props.fsmOffsetBackup
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
} //BlockFile___writeSegment()


/**
 * Write all dirty segments in reverse order.
 *
 * @param {function} [cb] cb(err, [ret0, ..., retN])
 */
BlockFile.prototype.writeSegments = BlockFile__writeSegments
function BlockFile__writeSegments(cb) {
  var self = this

  cb = cb || function(){}

  var segs = u.filter(self.segments, function(seg){ return seg.dirty })
             .reverse()

  async.mapSeries( segs
                 , function(seg, cb){ self._writeSegment(seg.segNum, cb) }
                 , function(err, res){ if (err) cb(err); else cb() } )
} //BlockFile__writeSegments()


/**
 * Release blocks, described by hdl, from BlockFile
 *
 * @param {Handle} hdl
 * @returns {undefined}
 * @throws {InvalidHandleError} when hdl is not a allocated span of blocks in the givens segment.
 */
BlockFile.prototype.release = BlockFile__release
function BlockFile__release(hdl) {

  var seg = this.segment[hdl.segNum]

  seg.release(hdl)

  if (spanNum !== hdl.spanNum)
    throw new InvalidHandleError()
} //BlockFile__release()


/**
 * Reserve a number of blocks into a Handle
 *
 * @param {number} numBlks
 * @returns {Handle}
 */
BlockFile.prototype._reserve = BlockFile___reserve
function BlockFile___reserve(numBlks) {
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
} //BlockFile___reserve()


/**
 * Load block buffer from BlockFile described by hdl
 *
 * @param {Handle} hdl Handle object describes where to write buffer
 * @param {Function} cb Callback (err, buffer, handle)
 */
BlockFile.prototype.load = BlockFile__load
function BlockFile__load(hdl, cb) {
  var buffer = new Buffer(this.props.blockSize*(1+hdl.spanNum))
    , blkOff = this._calcBlkOff(hdl.segNum, hdl.blkNum)

  fs.read( this.fd
         , buffer         /*buffer*/
         , 0              /*buffer position*/
         , buffer.length  /*number of bytes to read*/
         , blkOff         /*file position*/
         , function(err, bRead, buf){
             if (err) cb(err)
             else cb(null, buf, hdl)
           } )
} //BlockFile__load()


/**
 * Store block buffer copy-on-write semantics
 *
 * @param {Buffer} buffer Buffer object that is written to hdl location
 * @param {Function} cb Callback (err, handle)
 * @returns {Handle}
 */
BlockFile.prototype.store = BlockFile__store
function BlockFile__store(buffer, cb) {
  var numBlks, len, segNum, hdl, blkOff

  numBlks = Math.ceil( buffer.length / this.props.blockSize )

  hdl = this._reserve(numBlks)

  this._store(buffer, hdl, cb)

  return hdl
} //BlockFile__store()


/**
 * Store block buffer to an exact location
 *
 * @param {Buffer} buffer
 * @param {Handle} hdl
 * @param {function} cb cb(err, hdl)
 */
BlockFile.prototype._store = BlockFile___store
function BlockFile___store(buffer, hdl, cb) {
  var blkOff

  blkOff = this._calcBlkOff(hdl.segNum, hdl.blkNum)
  fs.write( this.fd
          , buffer
          , 0             /*buffer position*/
          , buffer.length /*number of bytes*/
          , blkOff        /*file position*/
          , function(err, bWrit, buf){
              if (err) cb(err)
              else cb(null, hdl)
            }
          )
} //BlockFile___store()


BlockFile.prototype.sign = function(buffer){
  if (this.props.checkSumBits === 16)
    return signCRC16(buffer, 0)
  else if (this.props.checkSumBits === 32)
    return signCRC32(buffer, 0)
  else
    throw new Error("only checkSumBits of 16 & 32 are supported")
}


BlockFile.prototype.validate = function(buffer){
  if (this.props.checkSumBits === 16)
    return validateCRC16(buffer, 0)
  else if (this.props.checkSumBits === 32)
    return validateCRC32(buffer, 0)
  else
    throw new Error("only checkSumBits of 16 & 32 are supported")
}
//THE END