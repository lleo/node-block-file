
var assert = require('assert')
  , format = require('util').format
//  , printf = require('./utils').printf

/*
 * bits  #bits num    value
 * 0-12  13    8192   segment number
 * 16-27 15    32768  block number
 * 28-31  4    16     number of blocks
 *
 */
var constants = require('./constants')

var BLOCK_SIZE      = constants.BLOCK_SIZE
//Segment Number Info
  , SEGNUM_BITS     = 13 //out of uint32; aka the bit manipulation TYPE
  , SEGNUM_SHIFT    = 0
  , NUM_SEGNUM      = Math.pow(2,SEGNUM_BITS) //8092
  , MIN_SEGNUM      = 0
  , MAX_SEGNUM      = NUM_SEGNUM - 1 //8091
  , SEGNUM_MASK     = Math.pow(2,SEGNUM_BITS)-1 <<SEGNUM_SHIFT //0x1fff
//Block Number Info
  , BLOCKNUM_BITS   = 15
  , BLOCKNUM_SHIFT  = SEGNUM_BITS //13
  , NUM_BLOCKNUM    = (BLOCK_SIZE-2)*8 //num bits in block minus 2 crc16 bytes
  , MIN_BLOCKNUM    = 0
  , MAX_BLOCKNUM    = NUM_BLOCKNUM - 1 //65535
  , BLOCKNUM_MASK   = Math.pow(2, BLOCKNUM_BITS)-1 <<BLOCKNUM_SHIFT //0x3fff8000
//Span Number Info
  , SPANNUM_BITS    = 4
  , SPANNUM_SHIFT   = SEGNUM_BITS+BLOCKNUM_BITS //28
  , MIN_SPANNUM     = 0
  , MAX_SPANNUM     = Math.pow(2,SPANNUM_BITS)-1   //0xf
  , SPANNUM_MASK    = Math.pow(2,SPANNUM_BITS)-1 <<SPANNUM_SHIFT //0xf0000000


//Exported Handle constants
//Handle.BLOCK_SIZE     = BLOCK_SIZE //???
//Handle.SEGNUM_BITS    = SEGNUM_BITS    /** #bits reserved for segNum */
//Handle.SEGNUM_SHIFT   = SEGNUM_SHIFT   /** #bit segNum is shifted in handle */
//Handle.SEGNUM_MASK    = SEGNUM_MASK
Handle.MIN_SEGNUM     = MIN_SEGNUM     /** min segNum value */
Handle.MAX_SEGNUM     = MAX_SEGNUM     /** max segNum value */
//Handle.BLOCKNUM_BITS  = BLOCKNUM_BITS  /** #bits reserved for blkNum */
//Handle.BLOCKNUM_SHIFT = BLOCKNUM_SHIFT /** #bit segNum is shifted in handle */
//Handle.BLOCKNUM_MASK  = BLOCKNUM_MASK
Handle.MIN_BLOCKNUM   = MIN_BLOCKNUM   /** min blkNum */
Handle.MAX_BLOCKNUM   = MAX_BLOCKNUM   /** max blkNum */
//Handle.SPANNUM_BITS   = SPANNUM_BITS  /** #bits reserved for spanNum */
//Handle.SPANNUM_SHIFT  = SPANNUM_SHIFT /** #bit spanNum is shifted in handle */
//Handle.SPANNUM_MASK   = SPANNUM_MASK
Handle.MIN_SPANNUM    = MIN_SPANNUM   /** min spanNum */
Handle.MAX_SPANNUM    = MAX_SPANNUM   /** max spanNum */


/** Handle object describes the location of a block
 *
 * @constructor
 * @param {number} segNum Segment number the block resides in
 * @param {number} blkNum Block number of first block in the given segment
 * @param {number} spanNum Number of additional "blocks" handle identifies beyody one (eg 1+spanNum)
 */
exports = module.exports = Handle
function Handle(segNum, blkNum, spanNum) {
  Handle.assertValidSegNum(segNum)
  Handle.assertValidBlockNum(blkNum)
  Handle.assertValidSpanNum(spanNum)

  this.segNum  = segNum
  this.blkNum  = blkNum
  this.spanNum = spanNum
  this.value   = segNum | blkNum<<BLOCKNUM_SHIFT | spanNum<<SPANNUM_SHIFT
}


/** Throw an exception if given segment number is not [MIN_SEGNUM..MAX_SEGNUM]
 *  inclusive.
 * @param {number} segNum
 * @throws {Error}
 */
Handle.assertValidSegNum = Handle_assertValidSegNum
function Handle_assertValidSegNum(segNum){
  assert.ok(segNum % 1 === 0, format("segNum=%j not an Integer", segNum))
  assert.ok( segNum >= MIN_SEGNUM
           , format("segnum(%d) < MIN_SEGNUM(%d)", segNum, MIN_SEGNUM ) )
  assert.ok( segNum <= MAX_SEGNUM
           , format("segnum(%d) > MAX_SEGNUM(%d)", segNum, MAX_SEGNUM ) )
}

/** Throw an exception if given block number is not [MIN_BLOCKNUM..MAX_BLOCKNUM]
 *  inclusive.
 *
 * @param {number} blkNum
 * @throws {Error}
 */
Handle.assertValidBlockNum = Handle_assertValidBlockNum
function Handle_assertValidBlockNum(blkNum) {
  assert.ok(blkNum % 1 === 0, format("blkNum(%j) not an Integer", blkNum))
  assert.ok( blkNum >= MIN_BLOCKNUM
           , format("blkNum(%d) < MIN_BLOCKNUM(%d)", blkNum, MIN_BLOCKNUM) )
  assert.ok( blkNum <= MAX_BLOCKNUM
           , format("blkNum(%d) > MAX_BLOCKNUM(%d)", blkNum, MAX_BLOCKNUM) )
}

/** Throw an exception if given span number is not [MIN_SPANNUM..MAX_SPANNUM]
 *  inclusive.
 * @param {number} spanNum
 * @throws {Error}
 */
Handle.assertValidSpanNum = Handle_assertValidSpanNum
function Handle_assertValidSpanNum(spanNum) {
  assert.ok(spanNum % 1 === 0, format("spanNum(%j) not an Integer", spanNum))
  assert.ok( spanNum >= MIN_SPANNUM
           , format("spanNum(%d) < MIN_SPANNUM(%d)", spanNum, MIN_SPANNUM) )
  assert.ok( spanNum <= MAX_SPANNUM
           , format("spanNum(%d) > MAX_SPANNUM(%d)", spanNum, MAX_SPANNUM) )
}

/* Tests if given segment number is within [MIN_SEGNUM..MAX_SEGNUM] inclusive.
 * @param {number} segNum
 * @returns {boolean}
 */
Handle.isValidSegNum = Handle_isValidSegNum
function Handle_isValidSegNum(segNum){
  return segNum % 1 === 0 && segNum >= MIN_SEGNUM && segNum <= MAX_SEGNUM
}

/* Tests if given block number is within [MIN_BLOCKNUM..MAX_BLOCKNUM] inclusive.
 * @param {number} blkNum
 * @returns {boolean}
 */
Handle.isValidBlockNum = Handle_isValidBlockNum
function Handle_isValidBlockNum(blkNum) {
  return blkNum % 1 === 0 && blkNum >= MIN_BLOCKNUM &&  blkNum <= MAX_BLOCKNUM
}

/* Tests if given span number is within [MIN_SPANNUM..MAX_SPANNUM] inclusive.
 * @param {number} spanNum
 * @returns {boolean}
 */
Handle.isValidSpanNum = Handle_isValidSpanNum
function Handle_isValidSpanNum(spanNum) {
  return spanNum % 1 === 0 && spanNum >= MIN_SPANNUM && spanNum <= MAX_SPANNUM
}


/** Decode a 32bit handle value
 * @param {number} hdlv 32bit handle value
 * @return {Handle}
 */
Handle.decode = Handle_decode
function Handle_decode(hdlv) {
  var segNum, blkNum, spanNum
  segNum  = (hdlv & SEGNUM_MASK)   >> SEGNUM_SHIFT
  blkNum  = (hdlv & BLOCKNUM_MASK) >> BLOCKNUM_SHIFT
  spanNum = (hdlv & SPANNUM_MASK)  >> SPANNUM_SHIFT
  return new Handle(segNum, blkNum, spanNum)
}
