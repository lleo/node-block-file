// File: block_layer.js
// By: LunaticLeo
// On: 12/13/2012
// Abstract: Library to read/write fixed size blocks.

var util = require('util')
  , fs = require('fs')
//  , assert = require('assert')
  , assert = require('chai').assert
  , u = require('lodash') //require('underscore')
  , crc16 = require('crc').buffer.crc16
  , async = require('async')
  , format = util.format
  , inspect = util.inspect
  , log = console.log
  , utils = require('./utils')
  , readCRC     = utils.readCRC
  , validateCRC = utils.validateCRC
  , signCRC     = utils.signCRC
  , printf      = utils.printf
  , eprintf     = utils.eprintf
  , Handle = require('./handle')
  , NaiveFSM = require('./fsm_naive')
  , Segment = require('./segment')
  , constants = require('./constants')

//Imported constants
var BLOCK_SIZE = constants.BLOCK_SIZE

//Imported Handle constants
var MIN_SEGNUM   = Handle.MIN_SEGNUM
  , MAX_SEGNUM   = Handle.MAX_SEGNUM
  , MIN_BLOCKNUM = Handle.MIN_BLOCKNUM
  , MAX_BLOCKNUM = Handle.MAX_BLOCKNUM
  , MIN_SPANNUM  = Handle.MIN_SPANNUM
  , MAX_SPANNUM  = Handle.MAX_SPANNUM

//Imported Segment constants
var MAX_SEG_SIZE = Segment.MAX_SEG_SIZE

//BlockFile constants
var MD_OFFSET_PRIMARY = 0
  , MD_OFFSET_BACKUP  = BLOCK_SIZE
  , MD_MAP =
    {
      'crc16 value'        : 0   /* two byte crc16 uint16 */
    , 'number of segments' : 2   /* two byte uint16 Handle has 13bits segNum */
    }
  , FILE_HDR_SIZE = 2*BLOCK_SIZE
  , MAX_FILE_SIZE = FILE_HDR_SIZE + (MAX_SEG_SIZE * (MAX_SEGNUM+1))


//Exported BlockFile constants
/*DEL
BlockFile.MD_OFFSET_PRIMARY = MD_OFFSET_PRIMARY
BlockFile.MD_OFFSET_BACKUP  = MD_OFFSET_BACKUP
BlockFile.MD_MAP            = MD_MAP
*/
BlockFile.FILE_HDR_SIZE     = FILE_HDR_SIZE
BlockFile.MAX_FILE_SIZE     = MAX_FILE_SIZE


/** BlockFile constructor
 *
 * @param {string} filename
 * @param {object} options
 */
exports = module.exports = BlockFile
function BlockFile(filename, options) {
  if (options === undefined) options = {}
  assert(u.isPlainObject(options))

  this.filename = filename

  this.fd = undefined /* file descriptor */

  this.options = options

  this.fsmType = NaiveFSM

  this.fsm = undefined //this.initialize will `new fsmType(buffer)` this

  this.segments = [] //indexed by segment number
}

BlockFile.BLOCK_SIZE = BLOCK_SIZE

//util.inherits(BlockFile, ...)


/** Create a BlockFile
 *
 * @param {string} filename
 * @param {function} createcb Callback (err, bf)
 */
BlockFile.create = BlockFile_create
function BlockFile_create(filename, createcb) {
  var mdBuf = new Buffer(BLOCK_SIZE)
    , crcValue, fd, bf

  mdBuf.fill(0) //fill whole buffer with zeroes

  // number of segments
  var numSeg = 0
  mdBuf.writeUInt32BE(numSeg, MD_MAP['number of segments'])

  //MUST BE last write
  // file header checksum
  signCRC(mdBuf)

  async.waterfall(
    [
      function(cb) {
        //open in write & exclusive mode; ie errors out if file exists
        fs.open(filename, 'wx', cb)
      }

      // callback from fs.open is cb(err, fd)
    , function(fd_, cb) {
        fd = fd_
        // write header primary
        fs.write( fd
                , mdBuf             /*buffer*/
                , 0                 /*buffer offset*/
                , mdBuf.length      /*number of bytes to read*/
                , MD_OFFSET_PRIMARY /*file position*/
                , cb )
      }

      // callback from fs.write is cb(err, written, buffer)
    , function(written, buffer, cb) {
        assert.equal(written, BLOCK_SIZE)
        // write header backup
        fs.write( fd
                , mdBuf            /*buffer*/
                , 0                /*buffer offset*/
                , mdBuf.length     /*number of bytes to read*/
                , MD_OFFSET_BACKUP /*file position*/
                , cb )
      }

      // callback from fs.write is cb(err, written, buffer)
    , function(written, buffer, cb) {
        assert.equal(written, BLOCK_SIZE)

        fs.close(fd, cb)
      }

      // call back from fs.close is cb(err)
    , function(cb) {
        bf = new BlockFile(filename /*,options*/)
        bf.open(cb)
      }
    ],

    // callback from fs.close is cb(err) or error in waterfall
    function(err, bf) {
      if (err) createcb(err)
      else     createcb(null, bf)
    }
  )
} //end: BockFile__create


/** Open a BlockFile
 *
 * @param {object} [options]
 * @param {function} opencb opencb(err)
 */
BlockFile.prototype.open = BlockFile__open
function BlockFile__open(/*options, opencb*/) {
  var self = this
    , options, opencb
    , stat, bf

  if      (arguments.length == 1) {
    options = {}
    opencb  = arguments[0]
  }
  else if (arguments.length == 2) {
    options = arguments[0]
    opencb  = arguments[1]
  }
  else
    throw new Error(format("wrong number of open() args %d", arguments.length))

  options.mode = options.mode || 0644

  async.waterfall(
    [
      // stat(self.filename, ...)
      function(cb) {
        fs.stat(self.filename, function(err, stat) {
          if (err && err.code === 'ENOENT') {
            BlockFile.create(self.filename, function(err) {
              if (err) {
                cb(err)
                return
              }
              fs.stat(self.filename, cb)
            })
            return
          }
          cb(null, stat)
        })
      }
    , function(stat_, cb) {
        stat = stat_

        if (!stat.isFile()) { // filname is not a regular file
          cb(new Error("file, "+self.filename+", is not at regular file."))
          return /* no fall thru */
        }

        fs.open(self.filename, 'r+', cb)
      }
    , function(fd, cb) {
        // new BlockFile && initialize
        bf = new BlockFile(self.filename, fd, options)
        bf.initialize(cb, stat)
      }
    ],
    /* BlockFile__initialized: called with (err) arguments */
    opencb
  )
} //end: BlockFile__open


/** Initialize BlockFile object ex. read in segments
 *
 * @param {function} initcb signature (err, bf)
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

        // file size integer number of blocks
        if ( 0 !== (fileSize / BLOCK_SIZE) % 1 ) {
          errStr = format( "file size(%d) not an integer number of blocks(%d)"
                         , stat.size, BLOCK_SIZE )
          wfcb(new Error(errStr))
          return
        }

        if (fileSize < Handle.FILE_HDR_SIZE ) {
          errStr = format( "file size(%d) bigger than file header size(%d)"
                         , fileSize, Handle.FILE_HDR_SIZE )
          wfcb(new Error(errStr))
          return
        }

        fileSize -= Handle.FILE_HDR_SIZE

        //calculate number of segments from filesize
        calcNumSegs = Math.floor( fileSize / Handle.MAX_SEG_SIZE ) + 1
        if (Handle.isValidSegNum(calcNumSegs-1)) {
          wfcb(new Error(format("Invalid calculated number of Segments %d", calcNumSegs)))
          return
        }

        self.buffer = new Buffer(BLOCK_SIZE)

        async.waterfall(
          [
            function(lwfcb){
              //read PRIMARY file metadata block
              fs.read( self.fd
                     , self.buffer         /*buffer*/
                     , 0                   /*buffer offset*/
                     , self.buffer.length  /*number of bytes to read*/
                     , MD_OFFSET_PRIMARY   /*file position*/
                     , lwfcb )
            }
          , function(bytesRead, buffer, lwfcb){
              if ( !validateCRC(self.buffer) ) {
                //read BACKUP file metadata block
                fs.read( self.fd
                       , self.buffer         /*buffer*/
                       , 0                   /*buffer offset*/
                       , self.buffer.length  /*number of bytes to read*/
                       , MD_OFFSET_BACKUP    /*file position*/
                       , lwfcb )
                return
              }
              wfcb(null, bytesRead, buffer)
            }
          , function(bytesRead, buffer, lwfcb){
              if ( !validateCRC(self.buffer) ) {
                //PRIMARY & BACKUP are invalid
                throw new Error("PRIMARY & BACKUP file header blocks are invalid")
                return
              }
              fs.write( self.fd
                      , self.buffer         /*buffer*/
                      , 0                   /*buffer offset*/
                      , self.buffer.length  /*number of bytes to write*/
                      , MD_OFFSET_PRIMARY   /*file position*/
                      , lwfcb )
            }
          ]
        , function(err, written, buffer){ wfcb(err, written, buffer) } )
      }
    , function(bytesRead, buffer, wfcb) { //return from fs.read or fs.write
        var fileNumSegs, segNum=0

        fileNumSegs = buffer.readUInt16BE(MD_MAP['number of segments'])

        if (Handle.isValidSegNum(fileNumSegs-1)) {
          wfcb(new Error(format("Invalid 'number of segments' %d", fileNumSegs)))
          return
        }

        eprintf("numSegs=%d; calcNumSegs=%d;\n", fileNumSegs, calcNumSegs)

        //for 0..segment number -1
        //  read segment
        async.util(
          /* test */
          function(){ return segNum < fileNumSegs }
          /* body */
        , function(untilcb){
            self._readSegment(segNum, untilcb)
            segNum += 1
          }
        , wfcb /* finished or err */
        )
      }
    ]
  , initcb)
} //end: BlockFile__initialize


/** Create/append a new Segment
 *
 * @param {function}
 */
BlockFile.prototype.newSegment = BlockFile__newSegment
function BlockFile__newSegment() {
  var self = this
    , lastSegNum = self.segments.length

  self.segments.push( new Segment(self.segments.length, this.fsmType) )
}


/** Read in a new Segment
 *
 * @param {number} segNum
 * @param {Function} cb Callback (err, segment, segNum)
 */
BlockFile.prototype._readSegment = BlockFile__readSegment
function BlockFile__readSegment(segNum, cb) {
  Handle.assertValidSegNum(segNum)
  var self = this
    , seg, fileSegOff

//  seg = self.segments[segNum]
//  assert.ok( seg instanceof Segment, "seg is not a Segment" )

  fileSegOff = Handle.FILE_HDR_SIZE + ( segNum * Handle.MAX_SEG_SIZE )

  function readCB(err, bytesRead, buffer) {
    self.segments[segNum] = new Segment(segNum, buffer, self.fsmType)
    cb(null, self.segments[segNum])
  }

  fs.read( self.fd
         , seg.buffer         /*buffer*/
         , 0                  /*buffer offset*/
         , seg.buffer.length  /*number of bytes to read*/
         , fileSegOff         /*file position*/
         , readCB )
} //BlockFile__readSegment()


/**
 * Write a Segment. This means that we write the free space bitmap to the
 * block file.
 *
 * @param {number} segNum
 * @param {Function} cb Callback (err, segment, segNum)
 */
BlockFile.prototype._writeSegment = BlockFile__writeSegment
function BlockFile__writeSegment(segNum, cb) {
  Handle.assertValidSegNum(segNum)
  var self = this
    , seg, fileSegOff

}

function calculateSegmentOffset(segNum) {
  //FIXME
  throw new Error("not implemented")
}

function calculateBlockOffset(segNum, blkNum) {
  //FIXME
  throw new Error("not implemented")
}

/** Validate a segment
 *
 * @param {Segment} segment
 * @returns {boolean}
 */
BlockFile.prototype._validateSegment = BlockFile__validateSegment
function BlockFile__validateSegment(segment) {
  //FIXME
  throw new Error("not implemented")
}


/**
 * Release blocks, described by hdl, from BlockFile
 *
 * @param {Handle} hdl
 * @returns {undefined}
 * @throws {InvalidHandleError} when hdl is not a allocated span of blocks in the givens segment.
 */
BlockFile.prototype.release = BlockFile__release
function BlockFile__release(hdl) {
  Handle.assertValidHandle(hdl)
  assert.instanceOf(this.segment[hdl.segNum], Segment
                   , format("hdl.segNum(%d) not a Segment", hdl.segNum))
  var spanNum = this.segment[hdl.segNum].free(hdl.blkNum)
  if (spanNum !== hdl.spanNum)
    throw new InvalidHandleError()
}


/** Read block buffer from BlockFile described by hdl
 *
 * @param {Handle} hdl Handle object describes where to write buffer
 * @param {Function} cb Callback (err, buffer, handle)
 */
BlockFile.prototype.read = BlockFile__read
function BlockFile__read(hdl, cb) {
  //FIXME
  throw new Error("not implemented")
}


/** Write block buffer copy-on-write semantics
 *
 * @param {Buffer} buffer Buffer object that is written to hdl location
 * @param {Function} cb Callback (err, handle)
 * @returns {undefined}
 * @throws {InvalidHandleError} when hdl is not a allocated span of blocks in the givens segment.
 */
BlockFile.prototype.write = BlockFile__write
function BlockFile__write(buffer, cb) {
  var numBlks, len, segNum, hdl

  numBlks = Math.ceil( buffer.length / BLOCK_SIZE )

  len = this.segments.length
  for (segNum = 0; segNum < len; segNum += 1) {
    hdl = this.segments[segNum].reserve( numBlks )
    if ( !u.isUndefined(hdl) ) break
  }
  if ( segNum === len ) { //hdl not found
    this.newSegment()
  }

}
