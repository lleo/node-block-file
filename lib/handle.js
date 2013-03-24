
var assert = require('assert')
  , format = require('util').format
  , props = require('./props')

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
}

/**
 *
 */
Handle.updateProps = function(metaProps){
  Object.defineProperties(
    Handle,
    { MIN_SEGNUM  : { value: 0, enumerable: true, configurable: true }
    , MIN_BLOCKNUM: { value: 0, enumerable: true, configurable: true }
    , MIN_SPANNUM : { value: 0, enumerable: true, configurable: true }
    , BLOCK_SIZE  : { value:props.blockSize
                    , enumerable:true
                    , configurable:true }
    , MAX_SEGNUM  : { value:props.maxSegNum
                    , enumerable:true
                    , configurable:true }
    , MAX_BLOCKNUM: { value:props.maxBlkNum
                    , enumerable:true
                    , configurable:true }
    , NUM_BLOCKNUM: { value:props.numBlkNums
                    , enumerable:true
                    , configurable:true }
    , MAX_SPANNUM : { value:props.maxSpanNum
                    , enumerable:true
                    , configurable:true }
    })
} //setProps()

//Handle.setProps({blockSzBits:7})
props.on('changed', Handle.updateProps)

Handle.updateProps()


/** Throw an exception if given segment number is not [MIN_SEGNUM..MAX_SEGNUM]
 *  inclusive.
 * @param {number} segNum
 * @throws {Error}
 */
Handle.assertValidSegNum = Handle_assertValidSegNum
function Handle_assertValidSegNum(segNum){
  assert.ok(segNum % 1 === 0, format("segNum=%j not an Integer", segNum))
  assert.ok( segNum >= Handle.MIN_SEGNUM
           , format("segnum(%d) < MIN_SEGNUM(%d)", segNum, Handle.MIN_SEGNUM ) )
  assert.ok( segNum <= Handle.MAX_SEGNUM
           , format("segnum(%d) > MAX_SEGNUM(%d)", segNum, Handle.MAX_SEGNUM ) )
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
  assert.ok( blkNum >= Handle.MIN_BLOCKNUM
           , format("blkNum(%d) < MIN_BLOCKNUM(%d)"
                   , blkNum, Handle.MIN_BLOCKNUM) )
  assert.ok( blkNum <= Handle.MAX_BLOCKNUM
           , format("blkNum(%d) > MAX_BLOCKNUM(%d)"
                   , blkNum, Handle.MAX_BLOCKNUM) )
}

/** Throw an exception if given span number is not [MIN_SPANNUM..MAX_SPANNUM]
 *  inclusive.
 * @param {number} spanNum
 * @throws {Error}
 */
Handle.assertValidSpanNum = Handle_assertValidSpanNum
function Handle_assertValidSpanNum(spanNum) {
  assert.ok(spanNum % 1 === 0, format("spanNum(%j) not an Integer", spanNum))
  assert.ok( spanNum >= Handle.MIN_SPANNUM
           , format("spanNum(%d) < MIN_SPANNUM(%d)"
                   , spanNum, Handle.MIN_SPANNUM) )
  assert.ok( spanNum <= Handle.MAX_SPANNUM
           , format("spanNum(%d) > MAX_SPANNUM(%d)"
                   , spanNum, Handle.MAX_SPANNUM) )
}

/* Tests if given segment number is within [MIN_SEGNUM..MAX_SEGNUM] inclusive.
 * @param {number} segNum
 * @returns {boolean}
 */
Handle.isValidSegNum = Handle_isValidSegNum
function Handle_isValidSegNum(segNum){
  return segNum % 1 === 0 && segNum >= Handle.MIN_SEGNUM && segNum <= Handle.MAX_SEGNUM
}

/* Tests if given block number is within [MIN_BLOCKNUM..MAX_BLOCKNUM] inclusive.
 * @param {number} blkNum
 * @returns {boolean}
 */
Handle.isValidBlockNum = Handle_isValidBlockNum
function Handle_isValidBlockNum(blkNum) {
  return blkNum % 1 === 0 && blkNum >= Handle.MIN_BLOCKNUM &&  blkNum <= Handle.MAX_BLOCKNUM
}

/* Tests if given span number is within [MIN_SPANNUM..MAX_SPANNUM] inclusive.
 * @param {number} spanNum
 * @returns {boolean}
 */
Handle.isValidSpanNum = Handle_isValidSpanNum
function Handle_isValidSpanNum(spanNum) {
  return spanNum % 1 === 0 && spanNum >= Handle.MIN_SPANNUM && spanNum <= Handle.MAX_SPANNUM
}


/**
 * Test equivalency.
 *
 * @param {Handle} a
 * @param {Handle} b
 * @return {boolean}
 */
Handle.equals = function(a, b) {
  return a.segNum == b.segNum && a.blkNum == b.blkNum && a.spanNum == b.spanNum
}


/**
 * Test equivalency of this Handle with other Handle.
 *
 * @param {Handle} other
 * @return {boolean}
 */
Handle.prototype.equals = function(other) {
  return Handle.equals(this, other)
}


/**
 * Encode a handle into a 32 or 64 (based on props) value.
 *
 * @returns {number}
 */
Handle.prototype.encode = function(){
  var value = this.segNum | this.blkNum<<props.blkNumShift | this.spanNum<<props.spanNumShift
  return value
}


/**
 * Handle constructor. Decode a 32bit handle value into a Handle object.
 *
 * @param {number} hdlv 32bit handle value
 * @return {Handle}
 */
Handle.decode = Handle_decode
function Handle_decode(hdlv) {
  assert.equal(typeof hdlv, 'number')

  var intMask = Math.pow(2,props.numHandleBits)-1

  hdlv = hdlv & intMask //only use the bottom 32 bits
  var segNum  = (hdlv & props.segNumMask)
    , blkNum  = (hdlv & props.blkNumMask) >> props.blkNumShift
    , spanNum = (hdlv & props.spanNumMask) >> props.spanNumShift

  return new Handle(segNum, blkNum, spanNum)
}


/**
 * Duh!
 *
 * @returns {string}
 */
Handle.prototype.toString = function(){
  return this.segNum+"/"+this.blkNum+"/"+this.spanNum
}


//THE END