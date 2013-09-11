
"use strict";

var assert = require('assert')
  , format = require('util').format
  , Props = require('./props')

//Props.WARN = false

/*
 * bits  #bits num    value
 * 0-12  13    8192   segment number
 * 16-27 15    32768  block number
 * 28-31  4    16     number of blocks
 *
 */


/** Handle object describes the location of a block
 *
 * @constructor
 * @param {Number} segNum Segment number the block resides in
 * @param {Number} blkNum Block number of first block in the given segment
 * @param {Number} spanNum Number of additional "blocks" handle identifies beyody one (eg 1+spanNum)
 */
exports = module.exports = Handle
function Handle(segNum, blkNum, spanNum, props) {
  this.props = props || Props.defaultProps

  Handle.assertValidSegNum(segNum, this.props)
  Handle.assertValidBlockNum(blkNum, this.props)
  Handle.assertValidSpanNum(spanNum, this.props)

  this.segNum  = segNum
  this.blkNum  = blkNum
  this.spanNum = spanNum
}


/** Throw an exception if given segment number is not [MIN_SEGNUM..MAX_SEGNUM]
 *  inclusive.
 * @param {Number} segNum
 * @throws {Error}
 */
Handle.assertValidSegNum = function(segNum, props){
  props = props || Props.defaultProps
  assert.ok(segNum % 1 === 0, format("segNum=%j not an Integer", segNum))
  assert.ok( segNum >= props.minSegNum()
           , format("segnum(%d) < MIN_SEGNUM(%d)", segNum, props.minSegNum() ) )
  assert.ok( segNum <= props.maxSegNum()
           , format("segnum(%d) > MAX_SEGNUM(%d)", segNum, props.maxSegNum() ) )
}

/** Throw an exception if given block number is not [MIN_BLOCKNUM..MAX_BLOCKNUM]
 *  inclusive.
 *
 * @param {Number} blkNum
 * @throws {Error}
 */
Handle.assertValidBlockNum = function(blkNum, props){
  props = props || Props.defaultProps
  assert.ok(blkNum % 1 === 0, format("blkNum(%j) not an Integer", blkNum))
  assert.ok( blkNum >= props.minBlkNum()
           , format("blkNum(%d) < MIN_BLOCKNUM(%d)"
                   , blkNum, props.minBlkNum()) )
  assert.ok( blkNum <= props.maxBlkNum()
           , format("blkNum(%d) > MAX_BLOCKNUM(%d)"
                   , blkNum, props.maxBlkNum()) )
}

/** Throw an exception if given span number is not [MIN_SPANNUM..MAX_SPANNUM]
 *  inclusive.
 * @param {Number} spanNum
 * @throws {Error}
 */
Handle.assertValidSpanNum = function(spanNum, props){
  props = props || Props.defaultProps
  assert.ok(spanNum % 1 === 0, format("spanNum(%j) not an Integer", spanNum))
  assert.ok( spanNum >= props.minSpanNum()
           , format("spanNum(%d) < MIN_SPANNUM(%d)"
                   , spanNum, props.minSpanNum()) )
  assert.ok( spanNum <= props.maxSpanNum()
           , format("spanNum(%d) > MAX_SPANNUM(%d)"
                   , spanNum, props.maxSpanNum()) )
}

/* Tests if given segment number is within [MIN_SEGNUM..MAX_SEGNUM] inclusive.
 * @param {Number} segNum
 * @return {Boolean}
 */
Handle.isValidSegNum = function(segNum, props){
  props = props || Props.defaultProps
  return segNum % 1 === 0 && segNum >= props.minSegNum() && segNum <= props.maxSegNum()
}

/* Tests if given block number is within [MIN_BLOCKNUM..MAX_BLOCKNUM] inclusive.
 * @param {Number} blkNum
 * @return {Boolean}
 */
Handle.isValidBlockNum = function(blkNum, props){
  props = props || Props.defaultProps
  return blkNum % 1 === 0 && blkNum >= props.minBlkNum() &&  blkNum <= props.maxBlkNum()
}

/* Tests if given span number is within [MIN_SPANNUM..MAX_SPANNUM] inclusive.
 * @param {Number} spanNum
 * @return {Boolean}
 */
Handle.isValidSpanNum = function(spanNum, props){
  props = props || Props.defaultProps
  return spanNum % 1 === 0 && spanNum >= props.minSpanNum() && spanNum <= props.maxSpanNum()
}


/**
 * Test equivalency.
 *
 * @param {Handle} a
 * @param {Handle} b
 * @return {Boolean}
 */
Handle.equals = function(a, b) {
//  assert(a instanceof Handle, "Handle.equals: a !instanceof Handle")
//  assert(b instanceof Handle, "Handle.equals: b !instanceof Handle")
  return a.props.equals(b.props) &&
    a.segNum === b.segNum &&
    a.blkNum === b.blkNum &&
    a.spanNum === b.spanNum
}


/**
 * Test equivalency of this Handle with other Handle.
 *
 * @param {Handle} other
 * @return {Boolean}
 */
Handle.prototype.equals = function(other) {
//  assert(other instanceof Handle, "Handle#equals: other !instanceof Handle")
  return Handle.equals(this, other)
}


/**
 * Calculate the size of space (in bytes) that the Handle points to.
 *
 * @return {Number} non-zero positive integer number of bytes
 */
Handle.prototype.size = function(){
  return (this.spanNum+1) * this.props.blockSize()
}


/**
 * Encode a handle into a 32 or 64 (based on props) value.
 *
 * @return {Number}
 */
Handle.prototype.encode = function(){
  assert(this.props.numHandleBits == 32, "only support encoding 32 bit handles")

  var value = this.segNum << this.props.segNumShift() |
    this.blkNum  << this.props.blkNumShift()    |
    this.spanNum << this.props.spanNumShift()

  return value
}


/**
 * Handle constructor. Decode a 32bit handle value into a Handle object.
 *
 * @param {Number} hdlv 32bit handle value
 * @param {Props} [props]
 * @return {Handle}
 */
Handle.decode = function(hdlv, props){
  props = props || Props.defaultProps
  assert(props.numHandleBits == 32, "only support encoding 32 bit handles")
  assert.equal(typeof hdlv, 'number')

  var intMask = Math.pow(2,props.numHandleBits)-1

  hdlv = hdlv & intMask //only use the bottom 32 bits
  var segNum  = (hdlv & props.segNumMask())
    , blkNum  = (hdlv & props.blkNumMask()) >> props.blkNumShift()
    , spanNum = (hdlv & props.spanNumMask()) >> props.spanNumShift()

  return new Handle(segNum, blkNum, spanNum, props)
}


/**
 * Duh!
 *
 * @return {String}
 */
Handle.prototype.toString = function(){
  var metaPropsStr = JSON.stringify(this.props.metaProps())
  return this.segNum+"/"+this.blkNum+"/"+this.spanNum+metaPropsStr
}

Handle.minStringLen = function(props){
  var segNum  = props.minSegNum()
    , blkNum  = props.minBlkNum()
    , spanNum = props.minSpanNum()
    , hdl = new Handle(segNum, blkNum, spanNum, props)
  return hdl.toString().length
}

Handle.maxStringLen = function(props){
  var segNum  = props.maxSegNum()
    , blkNum  = props.maxBlkNum()
    , spanNum = props.maxSpanNum()
    , hdl = new Handle(segNum, blkNum, spanNum, props)
  return hdl.toString().length
}

Handle.fromString = function(s){
  var m = s.match(/^(\d+)\/(\d+)\/(\d+)(\{[^\}]+\})$/)
    , segNum  = parseInt( m[1], 10)
    , blkNum  = parseInt( m[2], 10)
    , spanNum = parseInt( m[3], 10)
    , metaProps = JSON.parse( m[4] )

  assert( Array.isArray(m)
        , "string failed to match /^(\d+)\/(\d+)\/(\d+)(\{[^\}]+\})$/" )

  var props = new Props(metaProps)
    , hdl = new Handle(segNum, blkNum, spanNum, props)

  return hdl
}

//THE END