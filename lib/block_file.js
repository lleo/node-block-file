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
  , Y = require('ya-promise')
  , pfs = require('./y-fs')
  , Stats = require('stats-api')

//this package
var utils = require('./utils')
  , seqp = utils.seqp
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
bfStats.createStat("tt_store ns", Stats.TimerNS ) //tt_store => time to store
bfStats.createStat("tt_load ns", Stats.TimerNS ) //tt_load => time to load
bfStats.createStat("tt_store ns ravg", Stats.RunningAverage
                  , { stat: bfStats.get("tt_store ns"), nelts: 1000 })
bfStats.createStat("tt_load ns ravg", Stats.RunningAverage
                  , { stat: bfStats.get("tt_load ns"), nelts: 1000 })
bfStats.createHistogram("hog tt_store ns", "tt_store ns", Stats.semiLogNS)
bfStats.createHistogram("hog tt_load ns", "tt_load ns", Stats.semiLogNS)

BlockFile.STATS = bfStats

//Exported BlockFile constants
BlockFile.MD_MAP = {
  'crc32 value'        : 0  //32bits; different from metaProps.checkSumBits
                            //  metaProps.checkSumBits is for FSM checksums
, 'number of segments' : 4  //DoubleBE; we are only using it for 53 integer
                            //  bits. It's the only way we can handle
                            //  metaProps.segNumBits ?! for numHandleBits == 64
, 'metaProps'          : 12 //variable size; hence, should always be last
}
BlockFile.MD_BLOCKSIZE = 4096
BlockFile.MD_HDRSIZE = 2 * BlockFile.MD_BLOCKSIZE
BlockFile.MD_OFFSET_PRIMARY = 0
BlockFile.MD_OFFSET_SECONDARY = BlockFile.MD_BLOCKSIZE


/**
 * BlockFile constructor
 *
 * @param {string} filename
 * @param {number} fd file descriptor from fs.open
 * @param {Props} [props]
 */
exports = module.exports = BlockFile
function BlockFile(filename, fd, mdBuf,  props) {
  this.props = props || Props.defaultProps

  this.filename = filename

  this.fd = fd

  this.mdBuf = mdBuf

  this.fsmType = NaiveFSM

  this.fsm = undefined //this.initialize will `new fsmType(buffer)` this

  this.segments = [] //indexed by segment number
}

//re-export basic objects
//
BlockFile.Props = Props
BlockFile.BlockFile = BlockFile
BlockFile.Handle = Handle


/** Create a BlockFile
 *
 * @param {string} filename
 * @param {Props} [props]
 * @param {function} createcb Callback (err, bf)
 */
BlockFile.create = BlockFile_create
function BlockFile_create(filename, metaProps_) {
  metaProps_ = metaProps_ || {}

  assert(u.isPlainObject(metaProps_), "metaProps argument is not a plain object")

  var metaProps = u.defaults( u.clone(metaProps_)
                            , Props.defaultProps.metaProps())

  Props.assertValidMetaProps(metaProps)

  // Construct the BlockFile metadata block
  //
  var mdBuf = new Buffer(BlockFile.MD_BLOCKSIZE)
    , crcValue, mode, fd, bf

  mdBuf.fill(0) //fill whole buffer with zeroes

  // 'number of segments'
  //
  var numSeg = 0
  mdBuf.writeDoubleBE(numSeg, BlockFile.MD_MAP['number of segments'])

  // 'metaProps'
  //
  var mpStr = JSON.stringify(metaProps)
    , mpStrLen = Buffer.byteLength(mpStr, 'utf8')
    , mdBufAvail = mdBuf.length - (BlockFile.MD_MAP['metaProps'] + 2)
  assert.ok(mpStrLen < Math.pow(2,16)) //mpStrLen < UInt16BE; that ^
  assert.ok(mdBufAvail >= mpStrLen)

  mdBuf.writeUInt16BE(mpStrLen, BlockFile.MD_MAP['metaProps'])
  mdBuf.write(mpStr, BlockFile.MD_MAP['metaProps']+2)

  //MUST BE last write
  // file header checksum
  signCRC32(mdBuf, BlockFile.MD_MAP['crc32 value'])

  mode = 420 //Octal: 0644; octals not allowed in strict mode

  return pfs.open(filename, 'wx+')
         .then(
           function(fd_){
             fd = fd_
             return pfs.write( fd
                             , mdBuf         /*buffer*/
                             , 0             /*buffer offset*/
                             , mdBuf.length  /*number of bytes to write*/
                             , BlockFile.MD_OFFSET_PRIMARY) /*file position*/
           })
         .spread(
           function(bytesWritten, buffer){
             return pfs.write( fd
                             , mdBuf         /*buffer*/
                             , 0             /*buffer offset*/
                             , mdBuf.length  /*number of bytes to write*/
                             , BlockFile.MD_OFFSET_SECONDARY) /*file position*/
           })
         .spread(
           function(bytesWritten, buffer){
             return pfs.close(fd)
           })
} //BockFile__create()


/** Open a BlockFile
 *
 * @param {string} filename
 * @param {Props} [props] in case we end up creating the file.
 */
BlockFile.open = BlockFile_open
function BlockFile_open(filename, metaProps) {
  metaProps = u.defaults(u.clone(metaProps||{}), Props.defaultProps.metaProps())

  var stat, fd, bf
    , mdBuf = new Buffer(BlockFile.MD_BLOCKSIZE)

  mdBuf.fill(0)

  assert.ok(typeof filename === 'string', "filename not a function")

  var mdOffsetCRC32 = BlockFile.MD_MAP['crc32 value']
    , fileOffsetPri = BlockFile.MD_OFFSET_PRIMARY
    , fileOffsetSec = BlockFile.MD_OFFSET_SECONDARY

  return pfs.stat(filename)
         .then(
           function(stat_){ stat = stat_  }
         , function(err){
             if (err.code === 'ENOENT') //fix it
               return BlockFile.create(filename, metaProps).then(
                 function(){ return pfs.stat(filename).then(
                   function(stat_){ stat = stat_ }) }
               )
             return err
           })
         .then(
           function(){
             if (!stat.isFile())
               throw new Error("file, "+filename+", is not at regular file.")
             if (stat.size < BlockFile.MD_HDRSIZE)
               throw new Error(format("file, %s, is not big enough to hold the metadata header blocks; %d < %d", filename, stat.size, BlockFile.MD_HDRSIZE))
             return pfs.open(filename, 'r+')
           })
         .then(
           function(fd_){
             fd = fd_
             return pfs.read( fd
                              , mdBuf           /*buffer*/
                              , 0               /*buffer offset*/
                              , mdBuf.length    /*number of bytes to read*/
                              , fileOffsetPri ) /*file position*/
           })
         .spread(
           function(bytesRead, buffer){
             var fix
             if ( !validateCRC32(buffer, mdOffsetCRC32) ) {
               fix = pfs.read( fd
                               , buffer          /*buffer*/
                               , 0               /*buffer offset*/
                               , buffer.length   /*number of bytes to read*/
                               , fileOffsetSec ) /*file position*/
                     .spread(
                       function(bytesRead, buffer){
                         if ( !validateCRC32(buffer, mdOffsetCRC32) ){
                           throw new Error("PRIMARY & SECONDARY file header blocks are invalid")
                         }
                         //SECONDARY good, need to fix PRIMARY
                         return pfs.write( fd
                                           , mdBuf
                                           , 0
                                           , mdBuf.length
                                           , BlockFile.MD_OFFSET_PRIMARY)
                       })
               return fix
             }
             return [bytesRead, buffer]
           })
         .spread(
           function(bytesRead, buffer){
             var mpStrLen, mpStr, metaProps, props

             mpStrLen = buffer.readUInt16BE(BlockFile.MD_MAP['metaProps'])
             mpStr = buffer.toString( 'utf8'
                                    , BlockFile.MD_MAP['metaProps']+2
                                    , BlockFile.MD_MAP['metaProps']+2 + mpStrLen)

             metaProps = JSON.parse(mpStr)

             props = new Props(metaProps)

             // new BlockFile && initialize
             bf = new BlockFile(filename, fd, mdBuf, props)
             return bf.initialize(stat)
           })
} //BlockFile__open()


/** Initialize BlockFile object ex. read in segments
 *
 * @param {fs.Stats} stat
 */
BlockFile.prototype.initialize = BlockFile__initialize
function BlockFile__initialize(stat) {
  assert.ok(stat instanceof fs.Stats)
  var self = this
    , fileSize, calcNumSegs, errStr, err

  fileSize = stat.size

  if (fileSize < BlockFile.MD_HDRSIZE ) {
    errStr = format( "file size(%d) bigger than file header size(%d)"
                   , fileSize, BlockFile.MD_HDRSIZE )
    throw new Error(errStr)
  }

  fileSize -= BlockFile.MD_HDRSIZE
  //calculate number of segments from filesize
  calcNumSegs = Math.ceil( fileSize / this.props.maxSegSize() )
  if (!(calcNumSegs == 0 || Handle.isValidSegNum(calcNumSegs-1, this.props))) {
    err = new Error(format("Invalid calculated number of Segments %d"
                          , calcNumSegs))
    throw err
  }

  var fileNumSegs, segNum=0

  fileNumSegs = this.mdBuf.readDoubleBE(BlockFile.MD_MAP['number of segments'])

  if (!(fileNumSegs === 0 || Handle.isValidSegNum(fileNumSegs-1, this.props))) {
    err = new Error(format("Invalid 'number of segments' %d", fileNumSegs))
    throw err
  }

  assert.strictEqual(calcNumSegs, fileNumSegs, "calcNumSegs !== fileNumSegs")
  //console.error("\ncalcNumSegs = %j", calcNumSegs)
  //console.error("fileNumSegs = %j", fileNumSegs)

  var p = Y.resolved()

  u.range(fileNumSegs).forEach(function(e,i){
    p = p.then(function(){ return self._readSegment(i) })
  })

  return p.then(function(){ return self })
} //BlockFile__initialize()


/**
 * Close out BlockFile resources. eg .fd
 *
 */
BlockFile.prototype.close = BlockFile__close
function BlockFile__close() {
  var self = this

  return self.writeSegments()
         .then(function(){ return self.writeHeader() })
         .then(function(){ return pfs.close(self.fd) })
} //BlockFile__close()


/**
 * Write BlockFile Header
 *
 */
BlockFile.prototype.writeHeader = BlockFile__writeHeader
function BlockFile__writeHeader() {
  var self = this

  var numSeg = self.segments.length
  this.mdBuf.writeDoubleBE(numSeg, BlockFile.MD_MAP['number of segments'])

  //not re-writing metaProps; should be preserved.

  //MUST BE last write
  // file header checksum
  signCRC32(this.mdBuf, BlockFile.MD_MAP['crc32 value'])

  return pfs.write( self.fd
                    , self.mdBuf
                    , 0
                    , self.mdBuf.length
                    , BlockFile.MD_OFFSET_PRIMARY )
         .then(function(){
           pfs.write( self.fd
                      , self.mdBuf
                      , 0
                      , self.mdBuf.length
                      , BlockFile.MD_OFFSET_SECONDARY )
         })
} //BlockFile__writeHeader()


/** Create/append a new Segment
 *
 * @returns {number} New setment number
 */
BlockFile.prototype.addSegment = BlockFile__addSegment
function BlockFile__addSegment() {
  var self = this
    , nextSegNum = self.segments.length
    , buffer = new Buffer(this.props.fsmSize())

  buffer.fill(0xff) //completely empty

  this.segments.push(new Segment(nextSegNum, buffer, this.fsmType, this.props))

  return nextSegNum
} //BlockFile__addSegment()


BlockFile.prototype._calcSegOff = function(segNum) {
  return BlockFile.MD_HDRSIZE + ( segNum * this.props.maxSegSize() )
}


BlockFile.prototype._calcBlkOff = function(segNum, blkNum) {
  return this._calcSegOff(segNum) +
    this.props.segHdrSize() +
    (blkNum * this.props.blockSize())
}


/** Read in a new Segment
 *
 * @param {number} segNum
 */
BlockFile.prototype._readSegment = BlockFile__readSegment
function BlockFile__readSegment(segNum) {
  var self = this
    , seg, fsmOff, fsmBuf

  fsmBuf = new Buffer(this.props.fsmSize())

  var segOffset = self._calcSegOff(segNum)
    , fileOffsetFsmPri = segOffset + self.props.fsmOffsetPrimary()
    , fileOffsetFsmSec = segOffset + self.props.fsmOffsetSecondary()

  return pfs.read( self.fd
                 , fsmBuf             /*buffer*/
                 , 0                  /*buffer offset*/
                 , fsmBuf.length      /*number of bytes to read*/
                 , fileOffsetFsmPri ) /*file position*/
         .spread(
           function(bytesRead, buffer){
             var fix
             if ( !validateCRC(buffer, self.props) ) {
               fix = pfs.read( self.fd
                             , fsmBuf             /*buffer*/
                             , 0                  /*buffer offset*/
                             , fsmBuf.length      /*number of bytes to read*/
                             , fileOffsetFsmSec ) /*file position*/
                     .spread(
                       function(bytesRead, buffer){
                         if ( !validateCRC(buffer, self.props) ) {
                           throw new Error(format("PRIMARY & SECONDARY FSM for Segment %d are invalid", segNum))
                         }
                         //SECONDARY good, need to fix PRIMARY
                         return pfs.write( self.fd
                                         , buffer
                                         , 0
                                         , buffer.length
                                         , fileOffsetFsmPri )
                       })
             }
             return [bytesRead, buffer]
           })
         .spread(function(bytesRead, buffer){
           self.segments[segNum] = new Segment(segNum, buffer, self.fsmType, self.props)
           return self.segments[segNum]
         })

} //BlockFile__readSegment()


/**
 * Write out a Segment free space bitmap to the block file.
 *
 * @param {number} segNum
 */
BlockFile.prototype._writeSegment = BlockFile___writeSegment
function BlockFile___writeSegment(segNum) {
  var self = this
    , seg = this.segments[segNum]


  //seg.sign()
  signCRC(seg.buffer, this.props)

  var segOffset = self._calcSegOff(segNum)
    , fileOffsetFsmPri = segOffset + self.props.fsmOffsetPrimary()
    , fileOffsetFsmSec = segOffset + self.props.fsmOffsetSecondary()

  return pfs.write( self.fd
                    , seg.buffer
                    , 0
                    , seg.buffer.length
                    , fileOffsetFsmPri )
         .then( function(v){ /*ignore v*/
           return pfs.write( self.fd
                             , seg.buffer
                             , 0
                             , seg.buffer.length
                             , fileOffsetFsmSec ) } )
         .then( function(v){ return /*drop v*/ } )

} //BlockFile___writeSegment()


/**
 * Write all dirty segments in reverse order.
 *
 */
BlockFile.prototype.writeSegments = BlockFile__writeSegments
function BlockFile__writeSegments() {
  var self = this
    , p = Y.resolved()

  var segs = u.filter(self.segments, function(seg){ return seg.dirty })

  if (segs.length > 0) {
    segs.reverse().forEach(function(seg){
      p = p.then(function(){ return self._writeSegment( seg.segNum ) })
    })
  }

  return p
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
 */
BlockFile.prototype.load = BlockFile__load
function BlockFile__load(hdl) {
  var buffer = new Buffer(this.props.blockSize() *(1+hdl.spanNum))
    , blkOff = this._calcBlkOff(hdl.segNum, hdl.blkNum)
    , doneNS = bfStats.get("tt_load ns").start()
    , readp, loadp

  readp = pfs.read( this.fd
                  , buffer         /*buffer*/
                  , 0              /*buffer position*/
                  , buffer.length  /*number of bytes to read*/
                  , blkOff         /*file position*/)

  readp.then(function(){ doneNS() }) //need to call doneNS w/o arguments

  loadp = readp.spread(function(bytesRead, buffer){
            return [buffer, hdl]
          })

  return loadp
} //BlockFile__load()


/**
 * Store block buffer
 *
 * @param {Buffer} buffer Buffer object that is written to hdl location
 * @returns {promise}
 */
BlockFile.prototype.store = function store(buffer, hdl){
  var numBlks, blkOff, writep, storep
    , doneNS = bfStats.get("tt_store ns").start()

  numBlks = Math.ceil( buffer.length / this.props.blockSize() )

  hdl = hdl || this._reserve(numBlks)

  blkOff = this._calcBlkOff(hdl.segNum, hdl.blkNum)
  writep = pfs.write( this.fd
                    , buffer
                    , 0             /*buffer position*/
                    , buffer.length /*number of bytes*/
                    , blkOff        /*file position*/ )

  writep.then(function(){ doneNS() }) //need to call doneNS w/o arguments

  storep = writep.spread(function(bytesWritten, buf){
             return hdl
           })

  return storep
}

//THE END