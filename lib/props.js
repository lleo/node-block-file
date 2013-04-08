
"use strict";

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
  , floor = Math.floor

function log2(v) {
  var r = Math.log(v)/Math.LN2
  //if v is event and the result is not an integer (ie fucked up double math),
  // then just round result to nearest integer.
  //basically Math.log(v)/Math.LN2 is getting the last bit of the fraction part
  // of the double-precision floting point number wrong (ie off by one).
  if (r%1 > 0 && r%1 <= 1.1368683772161603e-13) return Math.floor(r)
  return r
}

function requireBits(num) { return ceil(log2(num)) }
function toBits(bytes) { return bytes*8 }
function toBytes(bits) { return ceil(bits/8) }

var defaultMetaProps = {
  blockSzBits   : 12  //4096 bytes
, fsmSzBits     : null //should default over to blockSzBits
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

  Props.assertValidMetaProps( metaProps )

  Object.freeze(metaProps) //make Metaprops un-changable

  var properties = {
    _metaProps:
    { value: metaProps }
  , blockSzBits  :
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

exports = module.exports = Props

// Class Methods
//

Props.isValidMetaProps = function(metaProps){
  for (var p in defaultMetaProps)
    if (!u.has(metaProps, p)) return false

  //numHandleBits
  if ( typeof metaProps.numHandleBits != 'number' ) return false
  if ( metaProps.numHandleBits != 32 && metaProps.numHandleBits != 64)
    return false

  //checkSumBits
  if ( typeof metaProps.checkSumBits != 'number' ) return false
  if ( metaProps.checkSumBits != 16 && metaProps.checkSumBits != 32 )
    return false

  //blockSzBits
  if ( typeof metaProps.blockSzBits != 'number' ) return false
  if ( metaProps.blockSzBits%1 != 0 ) return false

  //fsmSzBits
  if (typeof metaProps.fsmSzBits != 'number' && metaProps.fsmSzBits !== null)
    return false

  var fsmSzBits = metaProps.fsmSzBits || metaProps.blockSzBits
  //if ( typeof fsmSzBits != 'number' ) return false
  if ( fsmSzBits%1 != 0 ) return false
  if ( pow(2, fsmSzBits) - (metaProps.checkSumBits/8) < 1 )
    return false
  if ( fsmSzBits > metaProps.numHandleBits ) return false

  //checkSumOffset
  if ( typeof metaProps.checkSumOffset != 'number' ) return false
  if ( metaProps.checkSumOffset%1 != 0 ) return false
  if ( metaProps.checkSumOffset < 0 ) return false
  var maxOffset = pow(2, fsmSzBits) - metaProps.checkSumBits/8
  if  (metaProps.checkSumOffset > maxOffset) return false

  //spanNumBits
  if ( typeof metaProps.spanNumBits != 'number' ) return false
  if ( metaProps.spanNumBits%1 != 0 ) return false
  if ( metaProps.spanNumBits < 0 ) return false
  if ( metaProps.spanNumBits+1 > metaProps.numHandleBits ) return false

  //fsmSzBits + spanNumBits
  var blkNumBits = ceil(log2(toBits(pow(2,fsmSzBits)) - metaProps.checkSumBits))
  if ( blkNumBits + metaProps.spanNumBits >= metaProps.numHandleBits )
    return false

  return true
}

Props.assertValidMetaProps = function(metaProps){
  for (var p in defaultMetaProps)
    assert(u.has(metaProps, p), format("metaProps does not have '%s'", p))

  //numHandleBits
  assert(typeof metaProps.numHandleBits == 'number'
        , "numHandleBits is not a number" )
  assert(metaProps.numHandleBits == 32 || metaProps.numHandleBits == 64
           , "numHandleBits is not 32 or 64")

  //checkSumBits
  assert(typeof metaProps.checkSumBits == 'number', "checkSumBits is not a number")
  assert(metaProps.checkSumBits == 16 || metaProps.checkSumBits == 32
        , "checkSumBits is not 16 or 32")

  //blockSzBits
  assert(typeof metaProps.blockSzBits == 'number', "blockSzBits is not a number")
  assert(metaProps.blockSzBits%1 == 0, "blockSzBits is not an Integer")

  //fsmSzBits
  assert(typeof metaProps.fsmSzBits == 'number' || metaProps.fsmSzBits === null
        , "metaProps.fsmSzBits must be a 'number' or a null")

  var fsmSzBits = metaProps.fsmSzBits || metaProps.blockSzBits
  assert(typeof fsmSzBits == 'number', "fsmSzBits is not a number")
  assert(fsmSzBits%1 == 0, "fsmSzBits is not an Integer" )
  assert( pow(2, fsmSzBits) - (metaProps.checkSumBits/8) >= 1
        , "fsmSzBits || blockSzBits is not large enough" )
  assert( fsmSzBits < metaProps.numHandleBits
        , "fsmSzBits || blockSzBits is greather-than-or-equal to numHandleBits" )


  //checkSumOffset
  assert( typeof metaProps.checkSumOffset == 'number'
        , "checkSumOffset is not a number" )
  assert( metaProps.checkSumOffset%1 == 0, "checkSumOffset is not an Integer" )
  assert( metaProps.checkSumOffset >= 0, "checkSumOffset is negative" )
  var maxOffset = pow(2, fsmSzBits) - metaProps.checkSumBits/8
  assert(metaProps.checkSumOffset <= maxOffset
        , format("checkSumOffset is greater than the maximu offset %d"
                , maxOffset))

  //spanNumBits
  assert( typeof metaProps.spanNumBits == 'number'
        , "spanNumBits is not a number" )
  assert( metaProps.spanNumBits%1 == 0, "spanNumBits is not an Integer" )
  assert( metaProps.spanNumBits >= 0, "spanNumBits is negative" )
  assert( metaProps.spanNumBits < metaProps.numHandleBits
        , "spanNumBits i greater-than-or-equal to numHandleBits")

  //fsmSzBits + spanNumBits
  var blkNumBits = ceil(log2(toBits(pow(2,fsmSzBits)) - metaProps.checkSumBits))
  assert( blkNumBits + metaProps.spanNumBits < metaProps.numHandleBits
     ,"fsmSzBits would require that the blkNumBits+spanNumBits >= numHandleBits")

  return true
}

// Instance Methods
//

Props.prototype.equals = function(other){
  var self = this
    , t = true

  u.keys(defaultMetaProps)
  .forEach(function(k){ t = (t && self[k] === other[k]) })

  return t
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

Props.defaultProps = new Props()


//