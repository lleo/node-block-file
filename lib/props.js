
/**
 * Rulez: (in order)
 *   All things named *Size are in bytes.
 *   All things named *SzBits are byte sizes in powers of 2
 *   All things named *Bits are in ..well bits duh :}
 */

//requires
var util = require('util')
  , inherits = util.inherits
  , format = util.format
  , u = require('lodash')
  , assert = require('assert')
  , EventEmitter = require('events').EventEmitter

//Utility functions
var pow  = Math.pow
  , ceil = Math.ceil

function log2(v) {
  var r = Math.log(v)/Math.LN2
  //if v is event and the result is not an integer (ie fucked up double math),
  // then just round result to nearest integer.
  //basically Math.log(v)/Math.LN2 is getting the last bit of the fraction part
  // of the double-precision floting point number wrong (ie off by one).
  if (v%2 == 0 && r%1 != 0) return Math.round(r)
  return r
}

function requireBits(num) { return Math.ceil(log2(num)) }
function toBits(bytes) { return bytes*8 }
function toBytes(bits) { return Math.ceil(bits/8) }

var defaultMetaProps = {
  blockSzBits   : 12  //4096 bytes
, fsmSzBits     : undefined //should default over to blockSzBits
, checkSumBits  : 16  //2 bytes
, checkSumOffset: 0   //beginning of block
, numHandleBits : 32  //32bit unsigned integer
, spanNumBits   : 4   //0-15 additional blocks per continguous span
}
//Object.freeze(defaultMetaProps)

function Props(metaProps_) {
  var metaProps = u.isPlainObject(metaProps_) ? u.clone(metaProps_) : {}
  u.defaults(metaProps, defaultMetaProps)

  var unsupported = u.difference(u.keys(metaProps), u.keys(defaultMetaProps))
  assert(unsupported.length === 0, format("Unknown metaProps %j", unsupported))

  assert( metaProps.numHandleBits == 32 || metaProps.numHandleBits == 64
        , "metaProps.numHandleBits may only be 32 or 64")
  assert( metaProps.checkSumBits == 16 || metaProps.checkSumBits == 32
        , "metaProps.checkSumBits may only be 16 or 32")

  //given (metaProps.fsmSzBits || metaProps.blockSzBits) ~= blkNumBits
  assert.ok((metaProps.fsmSzBits || metaProps.blockSzBits) + metaProps.spanNumBits <= metaProps.numHandleBits)

  var properties = {
    blockSzBits  :
    { get: function(){ return metaProps.blockSzBits }
    //, set: function(v){ metaProps.blockSzBits = v }
    , enumerable: true }
  , fsmSzBits    :
    { get: function(){ return metaProps.fsmSzBits || metaProps.blockSzBits }
    //, set: function(v){ metaProps.fsmSzBits = v }
    , enumerable: true }
    //Handle structure properties
  , checkSumBits :
    { get: function(){ return metaProps.checkSumBits }
    //, set: function(v){ metaProps.checkSumBits = v }
    , enumerable: true }
  , checkSumOffset:
    { get: function(){ return metaProps.checkSumOffset }
    //, set: function(v){ metaProps.checkSumOffset = v }
    , enumerable: true }
  , numHandleBits:
    { get: function(){ return metaProps.numHandleBits }
    //, set: function(v){ metaProps.numHandleBits = v }
    , enumerable: true }
  , spanNumBits  :
    { get: function(){ return metaProps.spanNumBits }
    //, set: function(v){ metaProps.spanNumBits = v }
    , enumerable: true }
  , segNumBits   :
    { get: function(){
        return this.numHandleBits - this.spanNumBits - this.blkNumBits
      }
    , enumerable: true }
  , blockSize:
    { get: function(){ return pow(2, this.blockSzBits) }
    , enumerable: true }
  , numBlkNums   :
    { get: function(){ return toBits(this.fsmSize) - this.checkSumBits }
    , enumerable: true }
  , minBlkNum: { value: 0, enumerable: true }
  , maxBlkNum    :
    { get: function(){ return this.numBlkNums-1 }
    , enumerable: true }
  , numSegNums   :
    { get: function(){ return pow(2, this.segNumBits) }
    , enumerable: true }
  , minSegNum: { value: 0, enumerable: true }
  , maxSegNum    :
    { get: function(){ return this.numSegNums-1 }
    , enumerable: true }
  , numSpanNums  :
    { get: function(){ return pow(2, this.spanNumBits) }
    , enumerable: true }
  , minSpanNum: { value: 0, enumerable: true }
  , maxSpanNum   :
    { get: function(){ return this.numSpanNums-1 }
    , enumerable: true }
  , segNumShift  : { value: 0 }
  , segNumMask   :
    { get: function(){ return pow(2, this.segNumBits)-1 }
    , enumerable: true }
  , blkNumBits   :
    { get: function(){ return ceil(log2(this.numBlkNums)) }
    , enumerable: true }
  , blkNumShift  :
    { get: function(){ return this.segNumBits }
    , enumerable: true }
  , blkNumMask   :
    { get: function(){ return pow(2, this.blkNumBits)-1<<this.blkNumShift }
    , enumerable: true }
  , spanNumShift :
    { get: function(){ return this.segNumBits+this.blkNumBits }
    , enumerable: true }
  , spanNumMask  :
    { get: function(){ return pow(2, this.spanNumBits)-1<<this.spanNumShift }
    , enumerable: true }
  , fsmSize      :
    { get: function(){ return pow(2, this.fsmSzBits) }
    , enumerable: true }
  , segHdrSize   :
    { get: function(){ return 2*this.fsmSize }
    , enumerable: true }
  , fsmOffsetPrimary:
    { value: 0, enumerable: true }
  , fsmOffsetSecondary:
    { get: function(){ return this.fsmSize }
    , enumerable: true }
//  , numBlksSeg //isn't that just numBlkNums
  , maxSegSize:
    { get: function(){ return this.segHdrSize + this.numBlkNums*this.blockSize }
    , enumerable: true }
  , fileHdrSize:
    { get: function() { return 2 * this.blockSize }
    , enumerable: true }
  , mdOffsetPrimary:
    { value: 0, enumerable: true }
  , mdOffsetSecondary:
    { get: function() { return this.blockSize }
    , enumerable: true }
  } //end: props properties object

  var self =  Object.create(Props.prototype, properties)

  EventEmitter.call(self)

  //no adding or deleting, but metaProps can be changed via setters (above)
  Object.freeze(self)

  return self
} //constructor

inherits(Props, EventEmitter)

Props.defaultProps = new Props()

exports = module.exports = Props

/**
 * Set the defaultMetaProps for Props constructor.
 *
 * @param {object} metaProps
 */
Props.setDefaultMetaProps = function(metaProps){
  var unsupported = u.difference(u.keys(metaProps), u.keys(defaultMetaProps))
  assert(unsupported.length === 0, format("Unknown metaProps %j", unsupported))

  if (u.has(metaProps, 'numHandleBits'))
    assert( metaProps.numHandleBits == 32 || metaProps.numHandleBits == 64
          , "metaProps.numHandleBits may only be 32 or 64")
  if (u.has(metaProps, 'checkSumBits'))
    assert( metaProps.checkSumBits == 16 || metaProps.checkSumBits == 32
          , "metaProps.checkSumBits may only be 16 or 32")

  //given (metaProps.fsmSzBits || metaProps.blockSzBits) ~= blkNumBits
  assert.ok((metaProps.fsmSzBits || metaProps.blockSzBits) + metaProps.spanNumBits <= metaProps.numHandleBits)

  Props.defaultProps.setMetaProps(metaProps)
  for (var p in metaProps) {
    defaultMetaProps[p] = metaProps[p]
  }

  assert(this.segNumBits >= 0, "segNumBits < 0")
  assert(this.segNumBits <= 53, "segNumBits > 53") //doubles/ints blah, blah+
}

Props.prototype.equals = function(other){
  var self = this
    , t = true

  u.keys(defaultMetaProps)
  .forEach(function(k){ t = t && self[k] === other[k] })

  return t
}

Props.prototype.setMetaProps = function(metaProps){
  var unsupported = u.difference(u.keys(metaProps), u.keys(defaultMetaProps))
  assert(unsupported.length === 0, format("Unknown metaProps %j", unsupported))

  if (u.has(metaProps, 'numHandleBits'))
    assert( metaProps.numHandleBits == 32 || metaProps.numHandleBits == 64
          , "metaProps.numHandleBits may only be 32 or 64")
  if (u.has(metaProps, 'checkSumBits'))
    assert( metaProps.checkSumBits == 16 || metaProps.checkSumBits == 32
          , "metaProps.checkSumBits may only be 16 or 32")

  //given (metaProps.fsmSzBits || metaProps.blockSzBits) ~= blkNumBits
  assert.ok((metaProps.fsmSzBits || metaProps.blockSzBits) + metaProps.spanNumBits <= metaProps.numHandleBits)

  for (var p in metaProps) {
    this[p] = metaProps[p]
  }

  assert(this.segNumBits >= 0, "segNumBits < 0")
  assert(this.segNumBits <= 53, "segNumBits > 53") //doubles/ints blah, blah+

  this.emit('changed')
}

Props.prototype.maxNumBlks = function(){
  return this.numSegNums * this.numBlkNums
}

Props.prototype.maxSegSize = function(){
  return this.numSegNums*((2*this.fsmSize)+(this.numBlkNums*this.blockSize))
}

Props.prototype.maxFileSize = function(){
  return this.numSegNums * this.maxSegSize()
}

Props.prototype.maxDataSize = function(){
  return this.numSegNums * this.numBlkNums * this.blockSize
}


//