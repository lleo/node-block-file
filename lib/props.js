
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
var utils = require('./utils')
  , log2 = utils.log2
  , min = utils.min
  , max = utils.max
  , pow  = Math.pow
  , ceil = Math.ceil
  , floor = Math.floor

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
  //assert(unsupported.length === 0, format("Unknown metaProps %j", unsupported))
  if (Props.WARN && unsupported.length > 0)
    console.warn("Warning: unsuported metaProps = %j", unsupported)

  Props.assertValidMetaProps( metaProps )

  Object.freeze(metaProps) //make Metaprops un-changable

  var properties = {
    blockSzBits   : { value: metaProps.blockSzBits
                    , enumerable: true }
  , fsmSzBits     : { value:  metaProps.fsmSzBits || metaProps.blockSzBits
                    , enumerable: true }
  , checkSumBits  : { value: metaProps.checkSumBits
                    , enumerable: true }
  , checkSumOffset: { value: metaProps.checkSumOffset
                    , enumerable: true }
  , numHandleBits : { value: metaProps.numHandleBits
                    , enumerable: true }
  , spanNumBits   : { value: metaProps.spanNumBits
                    , enumerable: true }
  } //end: props properties object

  var self =  Object.create(Props.prototype, properties)

  EventEmitter.call(self)

  //no adding or deleting, but metaProps can be changed via setters (above)
  Object.freeze(self)

  return self
} //constructor

inherits(Props, EventEmitter)

Props.WARN = true

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
  var not = u.difference(u.keys(metaProps), u.keys(defaultMetaProps))
  //assert(not.length == 0, format("these keys are NOT supported %j", not))

  var req = u.difference(u.keys(defaultMetaProps), u.keys(metaProps))
  assert(req.length == 0, format("these keys are required %j", req))

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

Props.prototype.metaProps = function(){
  return {
    blockSzBits   : this.blockSzBits
  , fsmSzBits     : this.fsmSzBits
  , checkSumBits  : this.checkSumBits
  , checkSumOffset: this.checkSumOffset
  , numHandleBits : this.numHandleBits
  , spanNumBits   : this.spanNumBits
  }
}

Props.prototype.segNumBits = function(){
  return this.numHandleBits - this.spanNumBits - this.blkNumBits()
}

Props.prototype.blockSize = function(){
  return pow(2, this.blockSzBits)
}

Props.prototype.numBlkNums = function(){
  return toBits(this.fsmSize()) - this.checkSumBits
}

Props.prototype.minBlkNum = function(){
  return 0
}

Props.prototype.maxBlkNum = function(){
  return this.numBlkNums() - 1 + this.minBlkNum()
}

Props.prototype.numSegNums = function(){
  return pow(2, this.segNumBits())
}

Props.prototype.minSegNum = function(){
  return 0
}

Props.prototype.maxSegNum = function(){
  return this.numSegNums() - 1 + this.minSegNum()
}

Props.prototype.numSpanNums = function(){
  return pow(2, this.spanNumBits)
}

Props.prototype.minSpanNum = function(){
  return 0
}

Props.prototype.maxSpanNum = function(){
  return this.numSpanNums() - 1 + this.minSpanNum()
}

Props.prototype.segNumShift = function(){
  return 0
}

Props.prototype.segNumMask = function(){
  return pow(2, this.segNumBits()) - 1 //<< this.segNumShift() ??
}

Props.prototype.blkNumBits = function(){
  return ceil(log2(this.numBlkNums()))
}

Props.prototype.blkNumShift = function(){
  return this.segNumBits()
}

Props.prototype.blkNumMask = function(){
  return pow(2, this.blkNumBits()) - 1 << this.blkNumShift()
}

Props.prototype.spanNumShift = function(){
  return this.segNumBits() + this.blkNumBits()
}

Props.prototype.spanNumMask = function(){
  return pow(2, this.spanNumBits) - 1 << this.spanNumShift()
}

Props.prototype.fsmSize = function(){
  return pow(2, this.fsmSzBits)
}

Props.prototype.fsmOffsetPrimary = function(){
  return 0
}

Props.prototype.fsmOffsetSecondary = function(){
  return this.fsmSize()
}

Props.prototype.segHdrSize = function(){
  return 2*this.fsmSize()
}

Props.prototype.maxSegSize = function(){
  return this.segHdrSize() + ( this.numBlkNums() * this.blockSize() )
}

Props.prototype.maxFileSize = function(){
  return this.numSegNums() * this.maxSegSize()
}

Props.prototype.maxDataSize = function(){
  return this.numSegNums() * this.numBlkNums() * this.blockSize()
}


/**
 * maxHandleSize is the largest number of bytes a handle can address.
 * ie base block + max num of span blocks in bytes.
 */
Props.prototype.maxHandleSize = function(){
  return this.blockSize() + ( this.blockSize() * this.maxSpanNum() )
}

/**
 * minHandleSize is the largest number of bytes a handle can address.
 * ie base block + min num of span blocks in bytes.
 */
Props.prototype.minHandleSize = function(){
  return this.blockSize() + ( this.blockSize() * this.minSpanNum() )
}

Props.prototype.toString = function(){
  return JSON.stringify( this.metaProps() )
}

Props.fromString = function(s){
  return new Props( JSON.parse(s) )
}

Props.defaultProps = new Props()

//