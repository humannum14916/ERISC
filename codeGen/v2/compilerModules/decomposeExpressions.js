const misc = require("./misc.js");

function decomposeExpressions(fs){
  for(let f of fs){
    decomposeExpressionsF(f.contents);
  }
}

//code block loop
function decomposeExpressionsF(code){
  //loop through function
  for(let l of code){
    dExprLine(l);
  }
}

function dExprLine(l){
  //decompose
  if(l.type == "set"){
    //decompose source
    l.exp = dExpression(l.exp);
    //decompose dest
    l.dest = dExpression(l.dest);
  } else if(l.type == "call"){
    //decompose call params
    dCall(l.params);
  } else if(l.type == "branch" && l.condition){
    l.condition = dExpression(l.condition);
  }
}

//actual decomposition
function dExpression(e){
  //access, call, and parenthesis
  e = (e=>{
    let o = [];
    for(c of e){
      if(c.type == "call"){
        //get name
        let name = o.pop();
        if(!name) misc.error("Cannot start an expression with a call");
        //decompose params
        let params = dCall(c.params);
        //add back to expression
        o.push({type:"call",name,params});
      } else if(c.type == "access"){
        //get thing
        let thing = o.pop();
        if(!thing) misc.error("Cannot start an expression with an access");
        //decompose index
        let index = dExpression(c.index);
        //add back to expression
        o.push({type:"access",thing,index});
      } else if(c.type == "parenthesis"){
        //parenthesis
        o.push(dExpression(c.contents));
      } else {
        o.push(c);
      }
    }
    return o;
  })(e);
  //~
  e = (e=>{
    let o = [];
    while(e.length != 0){
      let cur = e.shift();
      if(cur.type == "operator" && cur.value.value == "~"){
        //get value to invert
        let val = e.shift();
        if(!val) misc.error("Cannot end and expression with ~",cur);
        //add
        o.push({type:"~",a:val});
      } else {
        o.push(cur);
      }
    }
    return o;
  })(e);
  //!
  e = (e=>{
    let o = [];
    while(e.length != 0){
      let cur = e.shift();
      if(cur.type == "operator" && cur.value.value == "!"){
        //get value to invert
        let val = e.shift();
        if(!val) misc.error("Cannot end and expression with !",cur);
        //add
        o.push({type:"!",a:val});
      } else {
        o.push(cur);
      }
    }
    return o;
  })(e);
  //->  * / %  + -  > < ==  & | ^
  for(let o of [
    "->",
    "*","/","%",
    "+","-",
    ">","<","==",
    "&","|","^"
  ]){
    e = snapOp(e,o);
  }
  //neaten
  e = e[0];
  //return
  return e;
}

//operator parsing
function snapOp(exp,op){
  let o = [];
  while(exp.length > 0){
    let c = exp.shift();
    if(
      c.type == "operator"
      && c.value.value == op
    ){
      let a = o.pop();
      let b = exp.shift();
      o.push({type:op,a,b});
    } else {
      o.push(c);
    }
  }
  return o;
}

//call decomposition
function dCall(params){
  for(let i=0;i<params.length;i++){
    params[i] = dExpression(params[i]);
  }
  return params;
}

//exports
module.exports = {decomposeExpressions};
