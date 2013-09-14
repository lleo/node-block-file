
"use strict";

var u = require('lodash')
  , assert = require('assert')
  , Props = require('./props')
  , Handle = require('./handle')

/* Strategy: whatever is easy to implement
 * Alloc:
 *   0) remove exact match gap off the end of the free gap list (pop), and
 *      update the beg/end indexies.
 *   1) remove next largest available gap off free gap list (pop), split it
 *      up and re-store remainding gap and update the beg/end indexies.
 *
 * Free:
 *   0) determine if block span is adjacent to any free block gaps.
 *     If so merge upto 16 (store remainder as appropriate) record on
 *     free gap list (append) & free gap beg/end indexies.
 *
 *
 */

exports = module.exports = NaiveFSM
function NaiveFSM(freeBlockMap, props) {
  this.props = props || Props.defaultProps

  assert.equal(freeBlockMap.length, this.props.numBlkNums())

  this.spans = []
  for (var g=this.props.minSpanNum(); g<=this.props.maxSpanNum(); g++) {
    this.spans[g] = [ /* begBlkNum0, ..., begBlkNumN */ ]
  }

  // fsi => free span index so we don't have to findSpanLoc
  this.fsiBeg = { /* begBlkNum : spanNum */ }
  this.fsiEnd = { /* endBlkNum : begBlkNum */ }

  for ( var curBlkNum = this.props.maxBlkNum();
        curBlkNum >= this.props.minBlkNum();
        curBlkNum -= 1 )
  {
    var free = freeBlockMap[curBlkNum]
      , curSpanNum = this.props.minSpanNum()
      , endBlkNum = curBlkNum

    if (free) {

      while(1) {
        if ( !free ||
             curSpanNum >= this.props.maxSpanNum() ||
             curBlkNum <= this.props.minBlkNum() ) {
          //capture
          var begBlkNum = curBlkNum
          this.spans[curSpanNum].push(begBlkNum)
          this.fsiBeg[begBlkNum] = curSpanNum
          this.fsiEnd[begBlkNum+curSpanNum] = begBlkNum

          break
        }

        curBlkNum -= 1
        curSpanNum += 1

        free = freeBlockMap[curBlkNum]
      } //while(1)
    } //if free
  } //foreach bit

  for (var i=0; i<=this.props.maxSpanNum(); i++)
    this.spans[i].reverse()

  //return this
}

//util.inherits(NaiveFSM, FreeSpaceMap)


/** Determine if two NaiveFSM objects are equal
 *
 * @param {NaiveFSM} a
 * @param {NaiveFSM} b
 * @return {Boolean}
 */
NaiveFSM.equal = function(a, b){
  //a.spans         [0..15][0..N] => begBlkNum in order lowest to highest
  //a.fsiBeg        {begBlkNum: spanNum}
  //a.fsiEnd        {endBlkNum: begBlkNum}
  if ( !(a instanceof NaiveFSM) ) return false
  if ( !(b instanceof NaiveFSM) ) return false
  if ( !u.isEqual(a.spans       , b.spans       ) ) return false //<=1ms
  if ( !u.isEqual(a.fsiBeg      , b.fsiBeg      ) ) return false //~3-4ms
  if ( !u.isEqual(a.fsiEnd      , b.fsiEnd      ) ) return false //~3-4ms
  return true
} //NaiveFSM.equal()


/** Determine a second NaiveFSM object is equal to the caller
 *
 * @param {NaiveFSM} fsm
 * @return {Boolean}
 */
NaiveFSM.prototype.equal = function(other){
  return NaiveFSM.equal(this, other)
} //.equal(other)


/** Allocate a number of blocks of contiguous space
 *
 * @param {Number} reqSpanNum [reqSpanNum=0] allocate one + spanNum blocks
 * @return {Number} begBlkNum where spanNum is implied
 */
NaiveFSM.prototype.alloc = function(reqSpanNum){
  if (reqSpanNum === undefined) reqSpanNum = this.props.minSpanNum()

  var spanNum, begBlkNum
  for (spanNum = reqSpanNum; spanNum <= this.props.maxSpanNum(); spanNum += 1) {
    if (this.spans[spanNum].length > 0) {
      begBlkNum = this._delete(spanNum, 0)
      break
    }
  }
  if (spanNum > this.props.maxSpanNum())
    return undefined //no room available in FSM

  // if span size > number of blocs I'm looking for
  //   extract the number of blocks and reinsert the rest as a new span
  var remBegBlkNum, remSpanNum
  if ( spanNum > reqSpanNum ) {
    remBegBlkNum = begBlkNum + reqSpanNum + 1
    remSpanNum = spanNum - (reqSpanNum + 1)

    //re-insert remSpan; preserve ordering of this.spans[spanNum]
    this._insert(remBegBlkNum, remSpanNum)
  }

  return begBlkNum //and reqSpanNum is implicit
} //.alloc()

/**
 * Test if the given blkNum and SpanNum touch any free space.
 *
 * @param {Number} begBlkNum
 * @param {Number} spanNum
 * @return {Boolean}
 */
NaiveFSM.prototype.isFree = function(blkNum, spanNum){
  //this is a cheat for now. otherwise we'd have to scan thru EVERY
  //(fsiBeg, spanNum) tuple to see if this (blkNum, spanNum) tuple intersects.
  //That is not great :{
//  return false

  //Ok I decided that given that IO is bazillion times slower that these simple
  // comparisons, this walk of fsiBeg is NoBigDeal(tm).
  var self = this
    , fBlkNums = Object.keys(this.fsiBeg).sort()

  for (var i; i< fBlkNums.length; i+=1) {
    var e = fBlkNums[i]
      , cBlkNum = +e //e is a string; +e converts it to a number
      , cSpanNum = self.fsiBeg[e]

//    console.warn("%d: blkNum(%d) >= cBlkNum(%d) && blkNum(%d) <= cBlkNum+cSpanNum(%d) => %s"
//                , i, blkNum, cBlkNum, blkNum, cBlkNum+cSpanNum
//                , blkNum >= cBlkNum && blkNum <= cBlkNum+cSpanNum)

    if (blkNum >= cBlkNum && blkNum <= cBlkNum+cSpanNum )
      return true
  }

  return false
}

/** Release allocated (blkNum, spanNum) tuple
 *
 * @param {Number} begBlkNum first block in a span
 * @param {Number} spanNum number of additional blocks
 * @return {Boolean}
 */
NaiveFSM.prototype.free = function(begBlkNum, spanNum){
//  console.warn("NaiveFSM#free: called: begBlkNum=%d; spanNum=%d;", begBlkNum, spanNum)

  if (this.isFree(begBlkNum, spanNum)) return false

  var tSpanNum
    , hiBlkNum, hiSpanNum
    , loBlkNum, loSpanNum
    , idx, len

  hiBlkNum  = begBlkNum+spanNum+1
  if ( Handle.isValidBlockNum(hiBlkNum, this.props) /*in the correct range*/) {
    // test if hiBlkNum is a free span via existance in this.fsiBeg[]
    hiSpanNum = this.fsiBeg[hiBlkNum]
    if ( hiSpanNum !== undefined ) {
      len = this.spans[hiSpanNum].length
      for (idx=0; idx<len; idx++) {
        if (this.spans[hiSpanNum][idx] === hiBlkNum) break
      }
      //if it existed in this.fsiBeg[hiBlkNum]
      // then it must be in this.spans[hiSpanNum][]
      //if (idx === len) /*not found*/

      //remove hiBlkNum from this.spans & this.fsiBeg & this.fsiEnd
      this._delete(hiSpanNum, idx)

      //begBlkNum = /*unchanged*/
      spanNum += 1 + hiSpanNum //number of blocks is 1 + spanNum
    }
  }

  loBlkNum  = this.fsiEnd[begBlkNum-1]
  if ( Handle.isValidBlockNum(loBlkNum, this.props) /*in the correct range*/) {
    // test if loBlkNum is a free span via existance in this.fsiBeg[]
    loSpanNum = this.fsiBeg[loBlkNum]
    if ( loSpanNum !== undefined ) {
      len = this.spans[loSpanNum].length
      for (idx=0; idx<len; idx++) {
        if (this.spans[loSpanNum][idx] === loBlkNum) break
      }
      //if it existed in this.fsiBeg[loBlkNum]
      // then it must be in this.spans[loSpanNum][]
      //if (idx === len) /*not found*/

      //remove loBlkNum from this.spans & this.fsiBeg & this.fsiEnd
      this._delete(loSpanNum, idx)

      begBlkNum = loBlkNum
      spanNum += 1 + loSpanNum //number of blocks is 1 + spanNum
    }
  }

  var begBlkNum2, spanNum2
  while (spanNum > this.props.maxSpanNum()) {
    spanNum2 = this.props.maxSpanNum()
    begBlkNum2 = begBlkNum+spanNum /*endBlkNum*/ - spanNum2 - 1
    spanNum -= spanNum2 + 1

    this._insert(begBlkNum2, spanNum2)
  }

  this._insert(begBlkNum, spanNum)

  return true
} //.free()


NaiveFSM.prototype._insert = NaiveFSM__insert
function NaiveFSM__insert(begBlkNum, spanNum) {
  var idx, len

  len = this.spans[spanNum].length
  for (idx = 0; idx < len; idx += 1) {
    if (this.spans[spanNum][idx] > begBlkNum) break
  }

  //above loop either broke on idx<length or idx==length; both ok
  this.spans[spanNum].splice(idx, 0, begBlkNum)
  this.fsiBeg[begBlkNum] = spanNum
  this.fsiEnd[begBlkNum+spanNum] = begBlkNum

} //.insert()


NaiveFSM.prototype._delete = function(spanNum, idx){
  var begBlkNum = this.spans[spanNum].splice(idx, 1)[0]
  delete this.fsiBeg[begBlkNum]
  delete this.fsiEnd[begBlkNum+spanNum]
  return begBlkNum
} //._delete()


//