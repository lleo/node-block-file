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
  , signCRC16     = utils.signCRC16
  , props = require('./props')
  , Handle = require('./handle')
  , NaiveFSM = require('./fsm_naive')
  , Segment = require('./segment')
  , constants = require('./constants')
//  , winston = require('winston')
//  , log = winston

//Exported BlockFile constants
// BlockFile.BLOCK_SIZE
// BlockFile.MD_OFFSET_PRIMARY
// BlockFile.MD_OFFSET_BACKUP
// Blockfile.MD_MAP
// BlockFile.FILE_HDR_SIZE
// BlockFile.MAX_FILE_SIZE


/**
 * BlockFile constructor
 *
 * @param {string} filename
 * @param {number} fd file descriptor from fs.open
 * @param {object} options
 */
exports = module.exports = BlockFile
function BlockFile(filename, fd, options) {
  if (options === undefined) options = {}

  this.filename = filename

  this.fd = fd

  this.options = options

  this.fsmType = NaiveFSM

  this.fsm = undefined //this.initialize will `new fsmType(buffer)` this

  this.segments = [] //indexed by segment number
}

//re-export basic objects
//
BlockFile.BlockFile = BlockFile
BlockFile.Handle = Handle

BlockFile.updateProps = function(){
  var map =  Object.freeze({ 'crc16 value'        : 0
                           , 'number of segments' : 2 })

  Object.defineProperties(
    BlockFile,
    { BLOCK_SIZE:
      { value: props.blockSize
      , enumerable: true
      , configurable: true }
    , MD_OFFSET_PRIMARY:
      { value: 0
      , enumerable: true
      , configurable: true }
    , MD_OFFSET_BACKUP:
      { value: props.blockSize
      , enumerable: true
      , configurable: true }
    , MD_MAP:
      { value: map
      , enumerable: true
      , configurable: true }
    , FILE_HDR_SIZE:
      { value: props.fileHdrSize
      , enumerable: true
      , configurable: true }
    , MAX_FILE_SIZE:
      { value: props.fileHdrSize + props.maxSegSize*props.numSegNums
      , enumerable: true
      , configurable: true }
    })
}

props.on('changed', BlockFile.updateProps)

BlockFile.updateProps()


/** Create a BlockFile
 *
 * @param {string} filename
 * @param {function} createcb Callback (err, bf)
 */
BlockFile.create = BlockFile_create
function BlockFile_create(filename, createcb) {
  var mdBuf = new Buffer(BlockFile.BLOCK_SIZE)
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
                , BlockFile.MD_OFFSET_PRIMARY /*file position*/
                , cb )
      }

      // callback from fs.write is cb(err, written, buffer)
    , function(written, buffer, cb) {
        // write header backup
        fs.write( fd
                , mdBuf            /*buffer*/
                , 0                /*buffer offset*/
                , mdBuf.length     /*number of bytes to read*/
                , BlockFile.MD_OFFSET_BACKUP /*file position*/
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
 * @param {object} [options]
 * @param {function} opencb opencb(err)
 */
BlockFile.open = BlockFile_open
function BlockFile_open(/*filename, options, opencb*/) {
  var args = Array.prototype.slice.call(arguments)
    , filename, options, opencb
    , stat, bf

  if (args.length < 2 || args.length > 3)
    throw new Error(format("wrong number of open() args %d", args.length))

  filename = args.shift()
  assert.ok(typeof filename === 'string')

  opencb = args.pop()
  assert.ok(typeof opencb === 'function')

  options = args.length == 1 ? args[0] : {}
  assert.ok( u.isPlainObject(options) )

  //options.mode = options.mode || 0644

  async.waterfall(
    [
      // stat(filename, ...)
      function(cb) {
        fs.stat(filename, function(err, stat) {
          if (err && err.code === 'ENOENT') {
            BlockFile.create(filename, function(err) {
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
        bf = new BlockFile(filename, fd, options)
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

        if (fileSize < BlockFile.FILE_HDR_SIZE ) {
          errStr = format( "file size(%d) bigger than file header size(%d)"
                         , fileSize, BlockFile.FILE_HDR_SIZE )
          wfcb(new Error(errStr))
          return
        }

        fileSize -= BlockFile.FILE_HDR_SIZE

        //calculate number of segments from filesize
        calcNumSegs = Math.ceil( fileSize / Segment.MAX_SEG_SIZE )
        if (!(calcNumSegs == 0 || Handle.isValidSegNum(calcNumSegs-1))) {
          wfcb(new Error(format("Invalid calculated number of Segments %d", calcNumSegs)))
          return
        }

        self.buffer = new Buffer(BlockFile.BLOCK_SIZE)

        async.waterfall(
          [
            function(lwfcb){
              //read PRIMARY file metadata block
              fs.read( self.fd
                     , self.buffer         /*buffer*/
                     , 0                   /*buffer offset*/
                     , self.buffer.length  /*number of bytes to read*/
                     , BlockFile.MD_OFFSET_PRIMARY   /*file position*/
                     , lwfcb )
            }
          , function(bytesRead, buffer, lwfcb){
              if ( !validateCRC16(self.buffer) ) {
                //read BACKUP file metadata block
                fs.read( self.fd
                       , self.buffer         /*buffer*/
                       , 0                   /*buffer offset*/
                       , self.buffer.length  /*number of bytes to read*/
                       , BlockFile.MD_OFFSET_BACKUP    /*file position*/
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
                      , BlockFile.MD_OFFSET_PRIMARY   /*file position*/
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
    , mdBuf = new Buffer(BlockFile.BLOCK_SIZE)

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
                , BlockFile.MD_OFFSET_PRIMARY /*file position*/
                , scb )
      }
    , function(scb){
        fs.write( self.fd
                , mdBuf            /*buffer*/
                , 0                /*buffer offset*/
                , mdBuf.length     /*number of bytes to read*/
                , BlockFile.MD_OFFSET_BACKUP /*file position*/
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
    , buffer = new Buffer(BlockFile.BLOCK_SIZE)

  //log.info("addSegment called nextSegNum="+nextSegNum)

  buffer.fill(0xff) //completely empty

  self.segments.push( new Segment(nextSegNum, buffer, this.fsmType) )

  return nextSegNum
} //BlockFile__addSegment()


function calcSegOff(segNum) {
  return BlockFile.FILE_HDR_SIZE + ( segNum * Segment.MAX_SEG_SIZE )
}


function calcBlkOff(segNum, blkNum) {
  return calcSegOff(segNum) + Segment.SEG_HDR_SIZE + (blkNum * BlockFile.BLOCK_SIZE)
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

  fsmBuf = new Buffer(Segment.FSM_SIZE)
  async.waterfall(
    [
      //read PRIMARY FSM
      function(wfcb){
        var fsmOff = calcSegOff(segNum) + Segment.FSM_OFFSET_PRIMARY
        fs.read( self.fd
         , fsmBuf         /*buffer*/
         , 0              /*buffer offset*/
         , fsmBuf.length  /*number of bytes to read*/
         , fsmOff         /*file position*/
         , wfcb )
      }
      //validate xor read BACKUP FSM
    , function(bRead, buffer, wfcb) {
        if ( !validateCRC16(buffer) ) {
          var fsmOff = calcSegOff(segNum) + Segment.FSM_OFFSET_BACKUP
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
        if ( !validateCRC16(buffer) ) {
          wfcb( new Error("PRIMARY & BACKUP FSM inavalid") )
          return
        }
        var fsmOff = calcSegOff(segNum) + Segment.FSM_OFFSET_PRIMARY
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


  signCRC16(seg.buffer)
  //seg.sign()

  async.waterfall(
    [ //write PRIMARY
      function(wfcb){
        var fsmOff = calcSegOff(segNum) + Segment.FSM_OFFSET_PRIMARY
        fs.write( self.fd
                , seg.buffer
                , 0
                , seg.buffer.length
                , fsmOff
                , wfcb)
      }
      //write BACKUP
    , function(bWrit, buffer, wfcb){
        var fsmOff = calcSegOff(segNum) + Segment.FSM_OFFSET_BACKUP
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
  var buffer = new Buffer(BlockFile.BLOCK_SIZE*(1+hdl.spanNum))
    , blkOff = calcBlkOff(hdl.segNum, hdl.blkNum)

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

  numBlks = Math.ceil( buffer.length / BlockFile.BLOCK_SIZE )

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

  blkOff = calcBlkOff(hdl.segNum, hdl.blkNum)
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


//THE END