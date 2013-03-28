
var u = require('lodash')
  , assert = require('assert')
  , Props = require('./props')
  , Handle = require('./handle')
  , utils = require('./utils')
  , printf = utils.printf
  , signCRC16 = utils.signCRC16
  , validateCRC16 = utils.validateCRC16
  , bufferReadBit = utils.bufferReadBit
  , bufferWriteBit = utils.bufferWriteBit

//var BLOCK_SIZE = Handle.BLOCK_SIZE
//
////Imported Handle constants
//var MIN_BLOCKNUM = Handle.MIN_BLOCKNUM
//  , MAX_BLOCKNUM = Handle.MAX_BLOCKNUM

/** Constructor for Segment of BpTree file
 *
 * @constructor
 * @param {number} segNum
 * @param {Buffer} buffer
 * @param {function} fsmType
 *
 */
exports = module.exports = Segment
function Segment(segNum, buffer, fsmType, props) {
  this.props = props || Props.defaultProps

  Handle.assertValidSegNum(segNum, this.props)
  assert.ok( Buffer.isBuffer(buffer), "argument buffer is not a Buffer" )
  assert.strictEqual(buffer.length, props.fsmSize)
  assert.equal(typeof fsmType, 'function', "argument fsmType is not a Function")

  this.segNum = segNum

  this.buffer = buffer //allocated externally

  this.freeBlockMap = []
  for (var i = this.props.minBlkNum; i <= this.props.maxBlkNum; i++) {
    this.freeBlockMap[i] = bufferReadBit(buffer,16+i)
  }

  this.fsmType = fsmType

  this.fsm = new fsmType(this.freeBlockMap, this.props)

  this.dirty = false
}

//Segment.updateProps = function(){
//  Object.defineProperties(
//    Segment,
//    { FSM_SIZE          : { value: props.fsmSize
//                          , enumerable: true
//                          , configurable: true }
//    , SEG_HDR_SIZE      : { value: props.segHdrSize
//                          , enumerable: true
//                          , configurable: true }
//    , FSM_OFFSET_PRIMARY: { value: props.fsmOffsetPrimary
//                          , enumerable: true
//                          , configurable: true }
//    , FSM_OFFSET_BACKUP : { value: props.fsmOffsetBackup
//                          , enumerable: true
//                          , configurable: true }
//    , MAX_SEG_SIZE      : { value: props.maxSegSize
//                          , enumerable: true
//                          , configurable: true }
//    })
//}//updateProps()
//
//props.on('changed', Segment.updateProps)
//Segment.updateProps()


/**
 * Get the value of the freeBlockMap/buffer-bit-field for a given block number
 *
 * @param {number} blkNum MIN_BLOCKNUM <= blkNum <= MAX_BLOCKNUM
 * @returns {boolean} free == true
 */
Segment.prototype.get = Segment__get
function Segment__get(blkNum) {
  //return this.freeBlockMap[blkNum]
  var fbmv = this.freeBlockMap[blkNum]
    , bufv = bufferReadBit(this.buffer, 16+blkNum)

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

  this.freeBlockMap[blkNum] = v
  bufferWriteBit(this.buffer, 16+blkNum, v)

  return this
}


/**
 * Allocate a handle; does not write to file
 *
 * @param {Number} numBlks reserve a number of blocks within this Segment
 * @returns {Handle|undefined}
 */
Segment.prototype.reserve = Segment__reserve
function Segment__reserve(numBlks) {
  var spanNum = numBlks-1
    , blkNum

  blkNum = this.fsm.alloc(spanNum)
  if (u.isUndefined(blkNum)) return undefined

  for (var i = blkNum; i <= blkNum+spanNum; i += 1) {
    this.set(i, false)
  }

  this.dirty = true

  return new Handle(this.segNum, blkNum, spanNum)
}


/**
 *
 * @param {Handle} hdl
 */
Segment.prototype.release = Segment__release
function Segment__release(hdl) {

  for (var i = hdl.blkNum; i <= hdl.blkNum+hdl.spanNum; i += 1) {
    this.set(i, true)
  }

  this.fsm.free(hdl.blkNum, hdl.spanNum)

  this.dirty = true
}


Segment.prototype.sign = Segment__sign
function Segment__sign() {
  signCRC16(this.buffer)
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

//THE END