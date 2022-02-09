
const misc = require("./compilerModules/misc.js");
const parsing = require("./compilerModules/parsing.js");
const nameResolution = require("./compilerModules/nameResolution.js");
const decomposeExpressions = require("./compilerModules/decomposeExpressions.js");
const expandExprs = require("./compilerModules/expandExpressions");
const stringify = require("./compilerModules/stringify.js");
const {
  collectType,branchify,structResolve,
  extractLDefs,neatenDefine
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
  //determine struct layout
  structs = structResolve(
    collectType(program,"struct")
  );
  //name resolution for definitions
  //and definition collection
  let names = structs.map(s=>{
    return [{
      value:s.name + ".length",
      line:s.line,column:s.column
    }].concat(Object.keys(s.slots).map(
      sn => {
        return {
          value:s.name+"."+sn,
          line:s.slots[sn].type.name.line,
          column:s.slots[sn].type.name.column
        };
      }
    ));
  }).flat();
  nameResolution.defCollect(names,{
    contents:program
  });
  //finish name resolution
  nameResolution.nameResolve(
    {contents:program},names,{name:{value:""}}
  );
  //remove namespaces and scopes
  program = nameResolution.finishResolution(
    {contents:program}
  );
  //collect other components
  let functions = collectType(program,"function");
  let metadata = collectType(program,"metadata");
  let defines = collectType(program,"define");
  //add struct type definitions
  defines = defines.concat(structs.map(st=>{
    return [{
      valType:{name:{value:"int"}},
      name:{value:st.name+".length"},
      value:{type:"number",value:st.length}
    }].concat(Object.keys(st.slots).map(sn=>{
      return [{
        valType:{name:{value:"int"}},
        name:{value:st.name+"."+sn},
        value:{
          type:"number",
          value:st.slots[sn].index
        }
      }];
    }).flat());
  }).flat());
  //neaten definitions
  defines = neatenDefine(defines);
  //handle local definitions
  for(let f of functions){
    //extract local definitions
    let lDefs = extractLDefs(f.contents);
    //handle defenitions
    if(f.stackless){
      //add to global definitions
      defines = Object.assign(defines,
        neatenDefine(lDefs)
      );
    } else {
      //stack functions are not done yet
      null.f;
    }
  }
  //decompose expressions
  decomposeExpressions.decomposeExpressions(functions);
  //expand expressions
  for(let f of functions){
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
  //specified headers
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
  if(!params[0]) misc.error("No build root!");
  let o = compile(d,params[0],params[1]);
  return o;
});
