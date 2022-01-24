const misc = require("./misc.js");

function expand(f,g){
  //output list
  let o = [];
  //temp bin
  let temps = {
    total:0,template:"__COMPILER_TEMP_"
    +f.name+"_"
  };
  //loop through contents
  for(let c of f.contents){
    if(c.type == "set"){
      let {to,writeDest} = backResolve(
        g,o,temps,c.dest,null,true
      );
      let f = backResolve(g,o,temps,c.exp,to);
      o = o.concat(writeDest);
      if(!to){
        o[o.length - 1].value = f;
      }
    } else if(c.type == "branch" && c.condition){
      c.condition = backResolve(g,o,temps,c.condition);
      o.push(c);
    } else if(c.type == "call"){
      backResolveCallParams(g,o,temps,c);
    } else {
      o.push(c);
    }
  }
  //return
  return o;
}

function backResolveCallParams(g,o,temps,call,to,){
  //resolve params
  for(let i=0;i<call.params.length;i++){
    call.params[i] = backResolve(
      g,o,temps,call.params[i],"__COMPILER-PARAM-"+
      call.name.value+"-"+g.function.filter(
        p=>{return p.name == call.name.value}
      )[0].params[i].name.value
    );
  }
  //add call
  o.push({type:"call",name:call.name.value});
  //move return
  if(to){
    o.push({
      type:"set",dest:to,
      value:"__COMPILER-RETURN-"+call.name.value
    });
  }
  return "__COMPILER-RETURN-"+call.name.value
}

function backResolve(g,o,temps,exp,to,left=false){
  //operation
  if(exp.type == "access"){
    //back resolve thing
    let thing = backResolve(
      g,o,temps,exp.thing
    );
    //back resolve index
    let index = backResolve(
      g,o,temps,exp.index
    );
    //left-side logic
    if(left){
      return {writeDest:[{
        type:"derefNset",
        thing,index
      }]};
    }
    //get destination
    if(!to){
      to = {type:"word",value:getTemp(
        g,temps,varType(g,thing).subType
      )};
    }
    //add
    o.push({
      type:"dereference",
      thing,index,to
    });
    return to;
  } else if(exp.type == "call"){
    //resolve call
    exp.name = exp.name.value
    backResolveCallParams(g,o,temps,exp,to);
  } else if(exp.type == "value"){
    if(left){
      return {to:exp.value,writeDest:[]};
    }
    if(to){
      o.push({
        type:"set",dest:to,value:exp.value
      });
      return {type:"word",value:to};
    }
    return exp.value;
  } else if(exp.type == "->"){
    if(
      exp.a.value.type != "word" ||
      exp.b.value.type != "word"
    ){
      console.error(exp);
      misc.error("Indirect struct access is not supported");
    }
    if(
      exp.b.value.value == "length" &&
      varType(g,exp.a.value).name.value
        == "array"
    ){
      if(left) misc.error("Cannot use array length as set destination",exp.a.value);
      //length
      let length = {
        type:"number",value:g.define
          [exp.a.value.value].length
      };
      if(to){
        o.push({
          type:"set",dest:to,value:length
        });
        return {type:"word",value:to};
      }
      return length;
    } else {
      //struct access
      let slot = g.struct.filter(s=>{
        return s.name == g.define
        [exp.a.value.value]
        .valType.name.value
      })[0].slots[exp.b.value.value];
      //get index
      let index = {type:"number",value:slot.index};
      //get destination
      if(!to){
        to = getTemp(
          g,temps,slot.type
        );
      }
      //left-side logic
      if(left){
        return {writeDest:[{
          type:"derefNset",
          thing:exp.a.value,index
        }]};
      }
      //add
      o.push({
        type:"dereference",
        thing:exp.a.value,index,to
      });
      return {type:"word",value:to};
    }
  } else {
    if(left){
      misc.error("Cannot use arithmatic result as set destination",exp.a.value);
    }
    //resolve a
    let a = backResolve(
      g,o,temps,exp.a
    );
    //resolve b
    let b;
    if(exp.b){
      b = backResolve(
        g,o,temps,exp.b
      );
    }
    //get types
    let at = typeStr(compType(g,a));
    let bt;
    if(b) bt = typeStr(compType(g,b));
    //type check
    let opReq = {
      "+":{types:[["int"],["int"]],match:true},
      "-":{types:[["int"],["int"]],match:true},
      "==":{types:["any","any"],match:true},
      ">":{types:[
        ["int","char"],["int","char"]
      ],match:true},
      "<":{types:[
        ["int","char"],["int","char"]
      ],match:true},
      "&":{types:[
        ["int","bool","char"],
        ["int","bool","char"]
      ],match:true},
      "~":{types:[
        ["bool"],[undefined]
      ],match:false},
      "!":{types:[
        ["bool"],[undefined]
      ],match:false},
    }[exp.type];
    if(!opReq) misc.error("[Dev] Op needs type requirements! "+exp.type);
    if(at != "null" && bt != "null"){
      if(at != bt && opReq.match) misc.error(`Mismatched types to operator ${exp.type}, got ${at} and ${bt}`,a);
      if(opReq.types[0].indexOf(at) == -1 && opReq.types[0] != "any")
        misc.error(`Operator ${exp.type} requires one of types ${opReq.types[0].join(", ")}, got ${at}`,a);
      if(opReq.types[1].indexOf(bt) == -1 && opReq.types[1] != "any")
        misc.error(`Operator ${exp.type} requires one of types ${opReq.types[1].join(", ")}, got ${bt}`,b);
    }
    //get output type
    let outType = {
      "+":{name:{type:"word",value:"int"}},
      "-":{name:{type:"word",value:"int"}},
      "==":{name:{type:"word",value:"bool"}},
      ">":{name:{type:"word",value:"bool"}},
      "<":{name:{type:"word",value:"bool"}},
      "&":"left",
      "~":{name:{type:"word",value:"bool"}},
      "!":{name:{type:"word",value:"bool"}},
    }[exp.type];
    if(outType == "left")
      outType = {name:{type:"word",value:at}};
    //get destination
    if(!to){
      to = {type:"word",value:getTemp(
        g,temps,outType
      )};
    }
    //add
    o.push({
      type:"op",
      opType:exp.type,
      a,b,to
    });
    return to;
  }
}

function typeStr(t){
  let o = t.name.value+"";
  if(t.subType){
    o += "["+typeStr(t.subType)+"]";
  }
  return o;
}

function getTemp(g,temps,typeR){
  //get type string
  let type = typeStr(typeR);
  //ensure temp bin
  if(!temps[type]) temps[type] = [];
  //check for temp
  if(temps[type].length == 0){
    //create new temp
    temps[type].push(
      temps.template+type+"_"+temps.total
    );
    temps.total++;
  }
  //get temp
  let temp = temps[type].shift();
  //add temp definition
  g.define[temp] = {
    valType:typeR,
    value:{type:"null",value:null}
  };
  //return temp
  return temp;
}

function toType(t){
  if(t == "number"){
    return {name:"int",subType:null};
  } else if(t == "null"){
    return {name:"null",subType:null};
  } else {
    misc.error("Compound type constants in expressions are not supported, had type "+t)
  }
}

function varType(g,varN){
  return g.define[varN.value].valType;
}

function compType(g,c){
  if(c.type == "number") return {name:{type:"word",value:"int"}};
  if(c.type == "null") return {name:{type:"word",value:"null"}};
  if(c.type == "word") return varType(g,c);
  if(c.type == "string"){
    if(c.value.length != 1) misc.error(`Character strings must be length 1, got "${c.value}"`,c);
    return {name:{type:"word",value:"char"}};
  }
}

//export
module.exports = {expand};