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
  , validateCRC = utils.validateCRC
  , Handle = require('./handle')
  , NaiveFSM = require('./fsm_naive')
  , Segment = require('./segment')
  , constants = require('./constants')


var BLOCK_SIZE = constants.BLOCK_SIZE
  , MD_OFFSET_PRIMARY = 0
  , MD_OFFSET_BACKUP = BLOCK_SIZE
  , MD_MAP =
    {
      'crc16 value'        : 0   /* two byte crc16 uint16 */
    , 'number of segments' : 2   /* two byte uint16 Handle has 13bits segNum */
    }

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

  this.options = u.clone(options)

  this.fsmType = NaiveFSM

  this.fsm = undefined //this.initialize will `new fsmType(buffer)` this

  this.segments = [] //indexed by segment number
}

BlockFile.BLOCK_SIZE = BLOCK_SIZE

//util.inherits(BlockFile, ...)


/** Create a BlockFile
 *
 * @param {string} filename
 * @param {Function} createcb Callback (err, bf)
 */
BlockFile.create = BlockFile_create
function BlockFile_create(filename, createcb) {
  var mdBuf = new buffer(BLOCK_SIZE)
    , crcValue, fd

  mdBuf.fill(0) //fill whole buffer with zeroes

  // number of segments
  var numSeg = 0
  mdBuf.writeUInt32BE(numSeg, MD_MAP['number of segments'])

  // file header checksum
  crcValue = crc16(mdBuf)
  mdBuf.writeUInt16BE(crcValue, MD_MAP['crc16 value'])

  //stat filename
  //open fd
  //initialize

  async.waterfall(
    [
      // no args at beginning of waterfall
      function(cb) {
        fs.stat(self.filename, function(err, stat){
          if (err) {
            if (err.code == 'ENOENT') {
              cb()
              return
            }
            cb(err)
            return
          }
          cb(new Error("File exists: "+self.filename))
        })
      }

      //successfull prev step is err.code == 'ENOENT'; cb called w/no args
    , function(cb) {
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
        var bf = new BlockFile(filename /*,options*/)
        bf.open(cb)
      }
    ],

    // callback from fs.close is cb(err) or error in waterfall
    createcb
  )
} //end: BockFile__create


/** Initialize BlockFile object ex. read in segments
 *
 * @param {Function} initcb signature (err, bf)
 */
BlockFile.prototype.initialize = BlockFile__initialize
function BlockFile__initialize(initcb) {
  var self = this
    , stat, segNum

  segNum = 0

  //open fd?
  //write metadata blocks
  //truncate fd

  async.waterfall(
    [
      function(cb) {
        fs.fstat(self.fd, cb)
      }
    , function(stat_, cb) {
        var numBlks, errStr
        stat = stat_

        if (stat.size < Handle.FILE_HDR_SIZE ) {
          errStr = format( "file size(%d) bigger than file header size(%d)"
                         , stat.size, Handle.FILE_HDR_SIZE )
          cb(new Error(errStr))
          return
        }

        // file size integer number of blocks
        if ( 0 !== (stat.size / BLOCK_SIZE) % 1 ) {
          errStr = format( "file size(%d) not an integer number of blocks(%d)"
                         , stat.size, BLOCK_SIZE )
          cb(new Error(errStr))
          return
        }

        //calculate number of segments from filesize
        numBlks = stat.size / BLOCK_SIZE
        numBlks -= FILE_HDR_SIZE / BLOCK_SIZE //file header blocks

        self.buffer = new Buffer(BLOCK_SIZE)

        //read file metadata block
        fs.read( self.fd
               , self.buffer         /*buffer*/
               , 0                   /*buffer offset*/
               , self.buffer.length  /*number of bytes to read*/
               , MD_OFFSET_PRIMARY   /*file position*/
               , cb )

      }
    , function(bytesRead, buffer, cb) { //return from fs.read
        var numSegs

        numSegs = buffer.readUInt16BE(MD_MAP['number of segments'])

        if (Handle.validSegNum(numSegs-1))
          cb(new Error(sprintf("Invalid 'number of segments' %d", numSegs)))

        //for 0..segment number -1
        //  read segment
        async.util(
          /* test */
          function(){
            return
          }
          /* body */
        , function(){

          }
        , cb /* finished or err */
        )
      }
    ]
  , initcb)
} //end: BlockFile__initialize


/** Open a BlockFile
 *
 * @param {Function} opencb
 */
BlockFile.prototype.open = BlockFile__open
function BlockFile__open(opencb) {
  var self = this
    , options, bf
    , mode = (options && options.mode) || 0644

  //open fd
  //read metadata
  //foreach segment read each segment

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
          cb(err, stat)
        })
      }
    , function(stat, cb) {
        // open(self.filename, ...)

        if (!stat.isFile()) { // filname is not a regular file
          cb(new Error("file, "+self.filename+", is not at regular file."))
          return /* no fall thru */
        }
        fs.open(self.filename, 'r+', mode, cb)
      }
    , function(fd, cb) {
        // new BlockFile && initialize
        bf = new BlockFile(self.filename, fd /*, options */)
        bf.initialize(cb)
      }
    ],
    /* BlockFile__initialized: called with (err) arguments */
    opencb
  )

  return
} //end: BlockFile__open


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
BlockFile.prototype._newSegment = BlockFile__newSegment
function BlockFile__newSegment(segNum, cb) {

}


/** Write a Segment
 *
 * @param {Segment} segment
 * @param {number} segNum
 * @param {Function} cb Callback (err, segment, segNum)
 */
BlockFile.prototype._writeSegment = BlockFile__writeSegment
function BlockFile__writeSegment(segment, segNum, cb) {
  //FIXME
  throw new Error("not implemented")
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


/** Read block buffer from BlockFile described by handle
 *
 * @param {Handle} handle Handle object describes where to write buffer
 * @param {Function} cb Callback (err, buffer, handle)
 */
BlockFile.prototype.read = BlockFile__read
function BlockFile__read(handle, cb) {
  //FIXME
  throw new Error("not implemented")
}


/** Write block buffer copy-on-write semantics
 *
 * @param {Buffer} buffer Buffer object that is written to handle location
 * @param {Function} cb Callback (err, handle)
 * @returns {undefined}
 */
BlockFile.prototype.write = BlockFile__write
function BlockFile__write(buffer, cb) {
  //FIXME
  throw new Error("not implemented")
}
