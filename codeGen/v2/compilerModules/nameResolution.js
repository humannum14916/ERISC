const misc = require("./misc.js");

//scopes
class Scope {
  constructor(parent,name,func){
    this.values = {};
    this.parent = parent;
    this.children = {};
    this.name = name;
    this.parent.children[this.name] = this;
    this.func = func;
  }
  defined(name){
    if(this.values[name]) return this.values[name];
    return this.parent.defined(name);
  }
  resolve(name){
    //split at .s
    name.value = name.value.split(".");
    //check for param / return
    if(this.func){
      if(name.value[name.value.length - 1] == "return"){
        name.value[name.value.length - 1] =
          "__COMPILER-RETURN-" +
          this.func.name.value
      }
      if(this.func.params.filter(p=>{
        return p.name.value ==
          name.value[name.value.length -1];
      }).length != 0){
        name.value[name.value.length - 1] =
          "__COMPILER-PARAM-" +
          this.func.name.value + "-"+
          this.func.params.filter(p=>{
            return p.name.value ==
              name.value[name.value.length -1];
          })[0].name.value;
      }
    }
    //go up to first name
    return this.resolveS2(name);
  }
  resolveS2(name){
    //check self
    if(this.values[name.value[0]]){
      //start found, return
      return this.trace()+name.value.join(".");
    }
    //not found, check parent
    return this.parent.resolveS2(name);
  }
  trace(name){
    if(this.name == "") return "";
    return this.parent.trace() + this.name + ".";
  }
}

//definition collection
function defCollect(program,prefix="",parent,func){
  //default parent
  if(!parent) parent = {
    defined:n=>{return false;},
    resolveS2:n=>{
      misc.error("Name \""+n.value+"\" not defined",n);
    },
    children:{}
  };
  //definitions
  let defs = new Scope(parent,
    prefix.split(".")[prefix.split(".").length-2] || "",
    func
  );
  //loop through block
  for(let c of program.contents){
    defCollectLine(c,defs,prefix);
  }
  //store scope
  program.scope = defs;
}

function defCollectLine(c,defs,prefix){
  //named
  if(c.type == "define" || c.type == "function"){
    //check for name collisions
    let collision = defs.defined(c.name.value);
    if(collision){
      misc.error("Name collision over "+collision.name.value+", defined "+misc.formAt(collision.name),c.name);
    }
    //prefix name
    let nameBase = c.name.value;
    c.name.value = prefix + nameBase;
    //define name
    defs.values[nameBase] = c;
  }
  //containing
  if(c.type == "namespace" || c.type == "function"){
    //check contents
    defCollect(c,c.name.value+".",defs,(
      c.type == "function"
    )?c:null);
  }
}

//name resolution
function nameResolve(program){
  //loop through program
  for(let c of program.contents){
    nameResolveLine(c,program.scope);
  }
}

function nameResolveLine(c,scope){
  //resolve contents
  if(c.type == "namespace" || c.type == "function"){
    //resolve contents
    nameResolve(c);
  }
  //resolve rest
  if(c.type == "set"){
    //resolve dest
    nameResolveExpression(c.dest,scope);
    //resolve source
    nameResolveExpression(c.exp,scope);
  } else if(c.type == "define"){
    //resolve starting value
    nameResolveValue(c.value,scope);
  } else if(c.type == "branch"){
    //resolve condition
    if(c.condition) nameResolveExpression(c.condition,scope);
    //update dest
    c.to = "__COMPILER_LABLE_"+scope.func.name.value+"_"+c.to;
  } else if(c.type == "call"){
    //resolve name
    c.name.value = scope.resolve(c.name);
    //resolve params
    c.params.forEach(p=>{
      nameResolveExpression(p,scope);
    });
  } else if(c.type == "lable"){
    //update name
    c.value = "__COMPILER_LABLE_"+scope.func.name.value+"_"+c.value;
  }
}

function nameResolveValue(v,scope){
  if(v.type == "word"){
    //resolve
    v.value = scope.resolve(v);
  } else if(v.type == "array"){
    //resolve contents
    for(let c of v.value){
      nameResolveValue(c,scope);
    }
  } else if(v.type == "struct"){
    //resolve contents
    for(let c of v.value){
      nameResolveValue(c.value,scope);
    }
  }
  return v;
}

function nameResolveExpression(e,scope){
  let skip = false;
  for(let c of e){
    if(skip){
      skip = false;
      continue;
    }
    if(c.type == "operator"){
      if(c.value.value == "->"){
        skip = true;
      }
      continue;
    } if(c.type == "value"){
      //resolve value
      nameResolveValue(c.value,scope);
    } else if(c.type == "call"){
      //resolve params
      c.params.forEach(p=>{
        nameResolveExpression(p,scope);
      });
    } else if(c.type == "access"){
      //resolve index
      nameResolveExpression(c.index,scope);
    } else if(c.type == "parenthesis"){
      //resolve contents
      nameResolveExpression(c.contents,scope);
    }
  }
}

//polishing
function finishResolution(program){
  //remove scope
  delete program.scope;
  //loop through children
  for(let c of program.contents){
    //namespace collapse
    if(c.type == "namespace"){
      c.contents.forEach(sc=>{
        finishResolution(sc);
        program.contents.push(sc);
      })
    }
    //remove scope
    delete c.scope;
  }
  //namespace removal
  program.contents = program.contents.filter(c=>{
    return c.type != "namespace";
  });
}

//export
module.exports = {defCollect,nameResolve,finishResolution};
