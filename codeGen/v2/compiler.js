
const misc = require("./compilerModules/misc.js");
const parsing = require("./compilerModules/parsing.js");
const nameResolution = require("./compilerModules/nameResolution.js");
const decomposeExpressions = require("./compilerModules/decomposeExpressions.js");
const expandExprs = require("./compilerModules/expandExpressions");
const neaten = require("./compilerModules/neaten.js");
const stringify = require("./compilerModules/stringify.js");
const {
  collectType,branchify,structResolve,extractLDefs
} = require("./compilerModules/assorted.js");

function compile(program,root,file){
  misc.error.file = program;
  misc.error.path = file;
  misc.error.root = root;
  //lex
  program = parsing.lex(program,root);
  //parse
  program = parsing.parseStructureBlock(program);
  //branchify functions
  collectType(program,"function").map(f=>{
    f.contents = branchify(f.contents);
  });
  //name resolution for definitions
  //and definition collection
  program = {
    contents:program,
    predefine:collectType(program,"struct")
      .map(s=>{return s.name.value})
  };
  nameResolution.defCollect(program);
  //finish name resolution
  nameResolution.nameResolve(program);
  //remove namespaces and scopes
  nameResolution.finishResolution(program);
  //collect other components
  let functions = collectType(program.contents,"function");
  let structs = collectType(program.contents,"struct");
  let metadata = collectType(program.contents,"metadata");
  let defines = collectType(program.contents,"define");
  //determine struct layout
  structs = structResolve(structs);
  //neaten definitions
  defines = neaten.neatenDefine(defines);
  //code processing round one
  for(let f of functions){
    //extract local definitions
    f.defines = extractLDefs(f.contents);
    //handle defenitions
    if(f.stackless){
      //add to global definitions
      defines = Object.assign(defines,
        neaten.neatenDefine(f.defines)
      );
      delete f.defines;
    } else {
      //stack functions are not done yet
      null.f;
    }
  }
  //decompose expressions
  decomposeExpressions.decomposeExpressions(functions);
  //neaten functions
  neaten.neatenFunction(functions);
  //code processing round two
  for(let f of functions){
    //expand expressions
    f.contents = expandExprs.expand(f,{define:defines,struct:structs,function:functions});
  }
  //stringify functions
  functions = 
    ";-----------;\n"+
    "; Functions ;\n"+
    ";-----------;\n\n"+
    functions.map(f=>{
      return stringify.stringifyF(f);
    }).join("\n\n\n")+"\n\n";
  //stringify definitions
  defines = 
    ";-------------;\n"+
    "; Definitions ;\n"+
    ";-------------;\n\n"+
    stringify.stringifyD(defines,structs);
  //build output
  let output = readFileSync(root+"headers/default");
  //userspace header
  metadata.forEach(m=>{
    if(m.key.value == "header"){
      output = output+readFileSync(root+"headers/"+m.value.value);
    }
  });
  //code
  output += functions + defines;
  //return
  return output;
}

const {readFileSync} = require("fs");
const {serve} = require("../../utils/ioWrap.js");

serve((d,params)=>{
  if(!params[0]) error("No build root!");
  let o = compile(d,params[0],params[1]);
  return o;
});
