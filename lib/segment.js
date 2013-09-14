
"use strict;"

var u = require('lodash')
  , assert = require('assert')
  , util = require('util')
  , format = util.format
  , Props = require('./props')
  , Handle = require('./handle')
  , utils = require('./utils')
  , readBit = utils.readBit
  , writeBit = utils.writeBit

/** Constructor for Segment of BpTree file
 *
 * @constructor
 * @param {Number} segNum
 * @param {Buffer} buffer
 * @param {Function} fsmType
 *
 */
exports = module.exports = Segment
function Segment(segNum, buffer, fsmType, props) {
  this.props = props || Props.defaultProps

  Handle.assertValidSegNum(segNum, this.props)
  assert.ok( Buffer.isBuffer(buffer), "argument buffer is not a Buffer" )
  assert.strictEqual(buffer.length, this.props.fsmSize())
  assert.equal(typeof fsmType, 'function', "argument fsmType is not a Function")

  this.segNum = segNum

  this.buffer = buffer //allocated externally

  this.freeBlockMap = []
  for (var i = this.props.minBlkNum(); i <= this.props.maxBlkNum(); i++) {
    this.freeBlockMap[i] = readBit(buffer,16+i)
  }

  this.fsmType = fsmType

  this.fsm = new fsmType(this.freeBlockMap, this.props)

  this.dirty = false
}

Segment.prototype.toString = function(){
  return format( "Segment(segNum=%d, buffer[%d], freeBlockMap[%d], fsm=%s, dirty=%j)"
               , this.segNum, this.buffer.length, this.freeBlockMap.length
               , u.isUndefined(this.fsm)?"undefined":"defined", this.dirty )
}


/**
 * Get the value of the freeBlockMap/buffer-bit-field for a given block number
 *
 * @param {Number} blkNum MIN_BLOCKNUM <= blkNum <= MAX_BLOCKNUM
 * @return {Boolean} free == true
 */
Segment.prototype.get = function(blkNum){
  //return this.freeBlockMap[blkNum]
  var fbmv = this.freeBlockMap[blkNum]
    , fixedOffset = this.props.checkSumOffset + this.props.checkSumBits
    , bufv = readBit(this.buffer, fixedOffset + blkNum)

  return fbmv
}


/**
 * Set the value of the freeBlockMap/buffer-bit-field for a given block number
 *
 * @param {Number} blkNum
 * @param {Boolean} v
 * @return {Segment}
 */
Segment.prototype.set = function(blkNum, v){
  var fixedOffset = this.props.checkSumOffset + this.props.checkSumBits

  this.freeBlockMap[blkNum] = v
  writeBit( this.buffer, fixedOffset + blkNum, v)
  //writeBit(this.buffer, 16+blkNum, v)

  return this
}


/**
 * Allocate a handle; does not write to file
 *
 * @param {Number} numBlks reserve a number of blocks within this Segment
 * @return {Handle}
 */
Segment.prototype.reserve = function(numBlks){
  var spanNum = numBlks-1
    , blkNum

  blkNum = this.fsm.alloc(spanNum)
  if (u.isUndefined(blkNum)) return undefined

  for (var i = blkNum; i <= blkNum+spanNum; i += 1) {
    this.set(i, false)
  }

  this.dirty = true

  return new Handle(this.segNum, blkNum, spanNum, this.props)
}


/**
 *
 * @param {Handle} hdl
 */
Segment.prototype.release = function(hdl){
  for (var i = hdl.blkNum; i <= hdl.blkNum+hdl.spanNum; i += 1) {
    this.set(i, true)
  }

  var ok = this.fsm.free(hdl.blkNum, hdl.spanNum)
  if (ok) {
    this.dirty = true
    return true
  }

  return false
}


Segment.equal = function(a, b){
  if (!(a instanceof Segment)) return false
  if (!(b instanceof Segment)) return false
  if ( !u.isEqual(a.segNum, b.segNum) ) return false
  if ( !u.isEqual(a.fsmType, b.fsmType) ) return false
  if ( !u.isEqual(a.freeBlockMap, b.freeBlockMap) ) return false
  if ( !(a.fsm.equal(b.fsm)) ) return false
  return true
}


Segment.prototype.equal = function(seg){
  return Segment.equal(this, seg)
}

//THE END