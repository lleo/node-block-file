
var assert = require('assert')
  , util = require('util')
  , format = util.format
  , u = require('lodash')
  , Handle = require('./handle')
  , utils = require('./utils')
  , printf = utils.printf
  , signCRC = utils.signCRC
  , validateCRC = utils.validateCRC
  , bufferReadBit = utils.bufferReadBit
  , bufferWriteBit = utils.bufferWriteBit

var BLOCK_SIZE       = require('./constants').BLOCK_SIZE /*bytes*/

//Imported Handle constants
var MIN_SEGNUM   = Handle.MIN_SEGNUM
  , MAX_SEGNUM   = Handle.MAX_SEGNUM
  , MIN_BLOCKNUM = Handle.MIN_BLOCKNUM
  , MAX_BLOCKNUM = Handle.MAX_BLOCKNUM
  , MIN_SPANNUM  = Handle.MIN_SPANNUM
  , MAX_SPANNUM  = Handle.MAX_SPANNUM

//Segment constants
var CRC16_OFFSET     = 0 /*bytes*/
  , BITFIELD_OFFSET  = 2 /*bytes*/ //crc16
  , BITFIELD_BEG     = BITFIELD_OFFSET*8 /*bits*/
  , BITFIELD_LEN     = (BLOCK_SIZE -2 /*crc16*/) * 8 /*bits*/
  , FSM_SIZE           = BLOCK_SIZE
  , FSM_OFFSET_PRIMARY = 0 /*bytes*/
  , FSM_OFFSET_BACKUP  = BLOCK_SIZE /*bytes*/
  , NUM_BLOCKS_SEG     = MAX_BLOCKNUM + 1 //number of blocks per segment
  , MAX_SEG_SIZE       = (2*BLOCK_SIZE) + (NUM_BLOCKS_SEG * BLOCK_SIZE)

//Exported Segment constants
/*
Segment.CRC16_OFFSET       = CRC16_OFFSET
Segment.BITFIELD_OFFSET    = BITFIELD_OFFSET
Segment.BITFIELD_BEG       = BITFIELD_BEG
Segment.BITFIELD_LEN       = BITFIELD_LEN
*/
Segment.FSM_SIZE           = FSM_SIZE
Segment.FSM_OFFSET_PRIMARY = FSM_OFFSET_PRIMARY
Segment.FSM_OFFSET_BACKUP  = FSM_OFFSET_BACKUP
Segment.NUM_BLOCKS_SEG     = NUM_BLOCKS_SEG
Segment.MAX_SEG_SIZE       = MAX_SEG_SIZE


/** Constructor for Segment of BpTree file
 *
 * @constructor
 * @param {number} segNum
 * @param {Buffer} buffer
 * @param {function} fsmType
 *
 */
exports = module.exports = Segment
function Segment(segNum, buffer, fsmType) {
  Handle.assertValidSegNum(segNum)

  assert.ok( Buffer.isBuffer(buffer), "argument buffer is not a Buffer" )
  assert.strictEqual(buffer.length, BLOCK_SIZE)

  assert.equal(typeof fsmType, 'function', "argument fsmType is not a Function")

  assert( validateCRC(buffer), "invalid CRC in buffer")

  this.segNum = segNum

  this.buffer = new Buffer(buffer.length)
  buffer.copy(this.buffer)

  this.freeBlockMap = []
  for (var i = MIN_BLOCKNUM; i <= MAX_BLOCKNUM; i++) {
    this.freeBlockMap[i] = bufferReadBit(buffer,16+i)
  }

  this.fsmType = fsmType

  this.fsm = new fsmType(this.freeBlockMap)

}

/**
 * Get the value of the freeBlockMap/buffer-bit-field for a given block number
 *
 * @param {number} blkNum MIN_BLOCKNUM <= blkNum <= MAX_BLOCKNUM
 * @returns {boolean} free == true
 */
Segment.prototype.get = Segment__get
function Segment__get(blkNum) {
  Handle.assertValidBlockNum(blkNum)
  //return this.freeBlockMap[blkNum]
  var fbmv = this.freeBlockMap[blkNum]
    , bufv = bufferReadBit(this.buffer, 16+blkNum)

  assert.equal( fbmv, bufv
              , format("freeBlockMap[%d] !==bufferReadBit(buf, %d)"
                      , blkNum, blkNum))

  return fbmv
}


/**
 * Set the value of the freeBlockMap/buffer-bit-field for a given block number
 *
 * @param {number} blkNum
 * @param {boolean} v
 * @returns {Segment}
 */
Segment.prototype.set = Segment__set
function Segment__set(blkNum, v) {
  Handle.assertValidBlockNum(blkNum)
  assert.ok(typeof v === 'boolean', format("v %j is not a boolean", v))

  this.freeBlockMap[blkNum] = v
  bufferWriteBit(this.buffer, 16+blkNum, v)

  return this
}


/**
 * Allocate a handle; does not write to file
 *
 * @param {Number} numBlks reserve a number of blocks within this Segment
 * @returns {Handle}
 */
Segment.prototype.reserve = Segment__reserve
function Segment__reserve(numBlks) {
  assert.ok(numBlks % 1 === 0, "numBlks not an Integer")
  assert.ok(numBlks > 0, format("numBlks %d < 1", numBlks))
  assert.ok(numBlks <= MAX_SPANNUM+1,
            format( "numBlks %d > MAX_SPANNUM+1 %d", numBlks, MAX_SPANNUM+1 ) )

  var spanNum = numBlks-1
    , blkNum

  blkNum = this.fsm.alloc(spanNum)

  for (var i = blkNum; i <= blkNum+spanNum; i += 1) {
    assert.ok( this.freeBlockMap[i], format("blkNum %d in segment %d already marked in use; after fsm.alloc(%d, %d)", i, this.segNum, blkNum, spanNum) )

    this.set(i, false)
//    this.freeBlockMap[i] = false
  }

  return new Handle(this.segNum, blkNum, spanNum)
}


/**
 *
 * @param {Handle} hdl
 */
Segment.prototype.release = Segment__release
function Segment__release(hdl) {
  assert(hdl instanceof Handle, "hdl arg MUST BE a Handle object")
  assert.equal( this.segNum, hdl.segNum
              , format("Handle, hdl.segNum %d not equal this.segNum %d"
                      , hdl.segNum, this.segNum) )

  for (var i = hdl.blkNum; i <= hdl.blkNum+hdl.spanNum; i += 1) {
    assert.ok( !this.freeBlockMap[i], format("blkNum %d in segment %d already marked free; before fsm.free(%d, %d)", i, this.segNum, hdl.blkNum, hdl.spanNum) )

    this.set(i, true)
//    this.freeBlockMap[i] = true
  }

  this.fsm.free(hdl.blkNum, hdl.spanNum)

}


Segment.prototype.sign = Segment__sign
function Segment__sign() {
  signCRC(this.buffer)
}


Segment.equal = Segment_equal
function Segment_equal(a, b) {
  if (!(a instanceof Segment)) return false
  if (!(b instanceof Segment)) return false
  if ( !u.isEqual(a.segNum, b.segNum) ) return false
  if ( !u.isEqual(a.fsmType, b.fsmType) ) return false
  if ( !u.isEqual(a.freeBlockMap, b.freeBlockMap) ) return false
  if ( !(a.fsm.equal(b.fsm)) ) return false
  return true
}


Segment.prototype.equal = Segment__equal
function Segment__equal(seg) {
  return Segment.equal(this, seg)
}


//NaiveFSM.prototype.pack = NaiveFSM__pack
//function NaiveFSM__pack(buffer) {
//  assert(Buffer.isBuffer(buffer), "param, buffer, is not of type Buffer")
//
//  for (var i = MIN_BLOCKNUM; i < MAX_BLOCKNUM; i += 1) {
//    bufferWriteBit(buffer, i+16, this.freeBlockMap[i])
//  }
//}


Segment.prototype.printf = Segment__printf
function  Segment__printf() {
  var args = [].slice.apply(arguments)
  printf.apply(undefined, args)
}
