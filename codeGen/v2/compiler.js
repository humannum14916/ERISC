
function error(m,at){
  console.error("Error: "+m);
  if(at){
    console.error(formAt(at));
    console.error(error.file.split("\n")[at.line-1]);
    console.error(" ".repeat(at.column-1)+"^");
  }
  null.f;//process.exit(1);
}

function formAt(at){
  return "at line "+at.line+", column "+at.column;
}

function typeCheck(v,e,ev){
  if(v.type != e) error("Expected "+e+", got "+v.type,v);
  if(ev && v.value != ev) error("Expected "+ev+", got "+v.value,v);
}

const parsing = (()=>{
  //lexing
  function lex(code,root){
    //preprocessing
    code = (code=>{
      let o = "";
      let inString = false;
      let escaped = false;
      let linked = [];
      while(code.length != 0){
        if(!inString){
          if(code[0] == "\""){
            inString = true;
          } else if(code.indexOf("#link ") == 0){
            code = code.slice(6);
            let end = code.indexOf("\n");
            let path = code.slice(0,end);
            code = code.slice(end);
            if(linked.indexOf(path) == -1){
              o += readFileSync(path);
              linked.push(path);
            }
          }
        } else {
          if(code[0] == "\\"){
            escaped = true;
          } else if(!escaped && code[0] == "\""){
            inString = false;
          }
        }
        o += code[0];
        code = code.slice(1);
      }
      return o;
    })(code);
    //split into characters
    code = code.split("").map(c=>{
      return {type:"character",value:c}
    });
    //add line and character information
    code = (code=>{
      let lineNum = 1;
      let charNum = 1;
      code.forEach(c=>{
        c.line = lineNum;
        c.column = charNum;
        charNum++;
        if(c.value == "\n"){
          lineNum++;
          charNum = 1;
        }
      });
      return code
    })(code);
    //collect strings
    code = (code=>{
      let codeO = [];
      let curString = "";
      let inString = false;
      let escaped = false;
      let startLine = 0;
      let startCol = 0;
      for(c of code){
        if(!inString){
          if(c.value != "\""){
            codeO.push(c);
          } else {
            inString = true;
            startLine = c.line;
            startCol = c.column;
          }
        } else {
          if(c.value == "\\"){
            escaped = true;
          } else if(c.value == "\"" && !escaped){
            inString = false;
            codeO.push({
              type:"string",value:curString,
              line:startLine,column:startCol
            });
            curString = "";
            escaped = false;
          } else {
            curString += c.value;
          }
          escaped = false;
        }
      }
      return codeO;
    })(code);
    //remove comments
    code = (code=>{
      let codeO = [];
      let firstSlash = false;
      let inComment = false;
      for(c of code){
        if(inComment == "line"){
          if(
            c.type == "character"
            && c.value == "\n"
          ){
            codeO.push(c);
            inComment = false;
          }
        } else if(inComment == "block"){
          if(firstSlash){
            if(
              c.type == "character"
              && c.value == "/"
            ) {
              inComment = false;
            }
            firstSlash = false;
          } else {
            if(
              c.type == "character"
              && c.value == "*"
            ) {
              firstSlash = true;
            }
          }
        } else {
          if(
            c.type == "character"
            && c.value == "/"
          ) {
            if(firstSlash){
              codeO.pop();
              firstSlash = false;
              inComment = "line";
            } else {
              codeO.push(c);
              firstSlash = true;
            }
          } else if(
            c.type == "character"
            && c.value == "*"
            && firstSlash
          ){
            codeO.pop();
            inComment = "block";
          } else {
            codeO.push(c);
          }
        }
      }
      return codeO;
    })(code);
    //collapse whitespace
    code = (code=>{
      let codeO = [];
      let startLine = 0;
      let startCol = 0;
      let inWhitespace = false;
      for(let c of code){
        if(
          c.type == "character"
          && /\s/.test(c.value)
        ){
          if(startLine == 0){
            startLine = c.line;
            startCol = c.column;
          }
          inWhitespace = true;
        } else {
          if(inWhitespace){
            inWhitespace = false;
            codeO.push({
              type:"whitespace",
              line:startLine,
              column:startCol
            });
          }
          codeO.push(c);
        }
      }
      return codeO;
    })(code);
    //trim
    if((code[0]||{}).type == "whitespace") code.shift();
    if((code[code.length-1]||{}).type == "whitespace")
      code.shift();
    //recognise (, {, and [
    code.forEach(c=>{
      if(
        c.type == "character"
        && "({[".indexOf(c.value) != -1
      ) {
        c.type = "encloseStart";
      }
    });
    //recognise ), }, and ]
    code.forEach(c=>{
      if(
        c.type == "character"
        && ")}]".indexOf(c.value) != -1
      ) {
        c.type = "encloseEnd";
      }
    });
    //recognise tokens
    code.forEach(c=>{
      if(
        c.type == "character"
        && ";,:=&|!+-*/><".indexOf(c.value) != -1
      ) {
        c.type = "token";
      }
    });
    //recognise words
    code = (code=>{
      let codeO = [];
      let curWord = "";
      let startLine = 0;
      let startCol = 0;
      for(let c of code){
        if(c.type == "character"){
          curWord += c.value;
          if(startLine == 0){
            startLine = c.line;
            startCol = c.column;
          }
        } else {
          if(curWord != ""){
            codeO.push({
              type:"word",value:curWord,
              line:startLine,column:startCol
            });
            curWord = "";
            startLine = 0;
          }
          codeO.push(c);
        }
      }
      return codeO;
    })(code);
    //recognize || && and ^^
    code.forEach(e=>{
      if(
        e.type == "word" &&
        ["&&","||","^^","!!"].indexOf(e.value) != -1
      ) {
        e.type == "token";
      }
    });
    //recognize -> and ==
    code = (code=>{
      let o = [];
      for(let c of code){
        if(
          c.type == "token" && c.value == ">" &&
          o[o.length - 1].type == "token" &&
          o[o.length - 1].value == "-"
        ){
          o.pop();
          o.push({type:"token",value:"->"});
        } else if(
          c.type == "token" && c.value == "=" &&
          o[o.length - 1].type == "token" &&
          o[o.length - 1].value == "="
        ){
          o.pop();
          o.push({type:"token",value:"=="});
        } else {
          o.push(c);
        }
      }
      return o;
    })(code);
    //remove whitespace markers
    code = code.filter(c=>{
      return c.type != "whitespace";
    });
    //handle enclosures
    code = enclose(code).contents;
    //return
    return code;
  }

  function enclose(code,end){
    let codeO = [];
    while(
      code.length != 0 &&
      code[0].type != "encloseEnd" &&
      code[0].value != end
    ) {
      if(code[0].type == "encloseStart"){
        //remove start
        let start = code.shift();
        //get contents
        let contents = enclose(code,
          ")}]"["({[".indexOf(start.value)]
        );
        code = contents.code;
        contents = contents.contents;
        //remove end
        code.shift();
        //add
        codeO.push({
          type:"enclose",
          contents,
          bound:start.value,
          line:start.line,
          column:start.column
        });
      } else {
        codeO.push(code.shift());
      }
    }
    if(code.length == 0 && end) error("Unclosed "+end);
    if(code.length != 0 && !end) error("Extra enlcose ending");
    return {code,contents:codeO};
  }

  //parsing
  function parseStructureBlock(code){
    let o = [];
    while(code.length > 0){
      //get line
      let line = [];
      try {
        while(
          code[0].type != "token"
          || code[0].value != ";"
        ) line.push(code.shift());
      } catch(e){
        if(code.length == 0){
          error("Unexpected end, you probably forgot a semicolon somewhere");
        } else throw e;
      }
      code.shift();
      //get line type
      let lineTypeF = line.shift();
      let lineType = lineTypeF.value;
      typeCheck(lineTypeF,"word");
      //parse line
      if(lineType == "meta"){
        //get key
        let key = line.shift();
        typeCheck(key,"word");
        //get value
        let value = line.shift();
        typeCheck(value,"word");
        //return
        o.push({
          type:"metadata",key,value
        });
      } else if(lineType == "struct"){
        //get name
        let name = line.shift();
        typeCheck(name,"word");
        //get contents / conforms
        let contents = line.shift();
        let conforms;
        if(
          contents.type == "word"
          && contents.value == "conforms"
        ) {
          //that's not contents, that's conforms!
          conforms = line.shift();
          typeCheck(conforms,"word");
          contents = line.shift();
        }
        typeCheck(contents,"enclose");
        contents = contents.contents;
        //parse contents
        let slots = [];
        while(contents.length != 0){
          //get type
          let type = parseType(contents);
          contents = type.rest;
          type = type.value;
          //get name
          let name = contents.shift();
          typeCheck(name,"word");
          //remove end-of-line token
          if(contents.length != 0){
            typeCheck(contents.shift(),"token",",");
          }
          //add to slot list
          slots.push({type,name});
        }
        //return
        o.push({
          type:"struct",name,conforms,slots
        });
      } else if(lineType == "define"){
        //get type
        let type = parseType(line);
        line = type.rest;
        type = type.value;
        //get name
        let name = line.shift();
        typeCheck(name,"word");
        //remove =
        typeCheck(line.shift(),"token","=");
        //get starting value
        let value = parseValue(line.shift());
        //return
        o.push({
          type:"define",valType:type,name,value
        });
      } else if(lineType == "function"){
        //check for stackless
        let stackless = false;
        if(
          line[0].type == "word"
          && line[0].value == "stackless"
        ) {
          stackless = true;
          line.shift();
        }
        //get type
        let retType = parseType(line);
        line = retType.rest;
        retType = retType.value;
        //get name
        let name = line.shift();
        typeCheck(name,"word");
        //get parameters
        let paramsR = line.shift();
        typeCheck(paramsR,"enclose");
        paramsR = paramsR.contents;
        //parse params
        let params = [];
        while(paramsR.length != 0){
          //get type
          let type = parseType(paramsR);
          paramsR = type.rest;
          type = type.value;
          //get name
          let name = paramsR.shift();
          typeCheck(name,"word");
          //remove end-of-line
          if(paramsR.length != 0){
            typeCheck(paramsR.shift(),"token",",");
          }
          //return
          params.push({
            type,name
          });
        }
        //get contents
        let contents = line.shift();
        typeCheck(contents,"enclose");
        contents = parseCodeBlock(contents.contents);
        //parameter and return variable definition
        if(stackless){
          //return variable
          if(retType.name.value != "void"){
            o.push({
              type:"define",
              valType:retType,
              name:{
                type:"word",line:-1,column:-1,
                value:"__COMPILER-RETURN-"
                  +name.value
              },
              value:{
                type:"null",value:"null",
                line:-1,column:-1
              }
            });
          }
          //parameters
          for(let p of params){
            o.push({
              type:"define",
              valType:p.type,
              name:{
                type:"word",line:-1,column:-1,
                value:"__COMPILER-PARAM-"
                  +name.value+"-"+p.name.value
              },
              value:{
                type:"null",value:"null",
                line:-1,column:-1
              }
            });
          }
        } else error("Stack functions aren't done yet :(",name);
        //return
        o.push({
          type:"function",stackless,retType,
          name,params,contents
        });
      } else if(lineType == "namespace"){
        //get name
        let name = line.shift();
        typeCheck(name,"word");
        //get contents
        let contents = line.shift();
        typeCheck(contents,"enclose");
        //parse contents
        contents = parseStructureBlock(contents.contents);
        //return
        o.push({
          type:"namespace",name,contents
        });
      } else {
        error("Expected line start, got \""+lineType+"\"",lineTypeF);
      }
      //check for excess
      if(line.length != 0) error("Excess after expected end of line",line[0]);
    }
    //return
    return o;
  }

  function parseType(line){
    //get name
    let name = line.shift();
    typeCheck(name,"word");
    //arrays
    let subType;
    if(name.value == "array"){
      //get array type
      subType = line.shift();
      typeCheck(subType,"enclose");
      subType = subType.contents;
      subType = parseType(subType);
      if(subType.rest.length != 0) error("Unexpected remainder in array type",type);
      subType = subType.value;
    }
    //return
    return {value:{name,subType},rest:line};
  }

  function parseValue(value){
    //check for compound value
    if(value.type == "enclose"){
      if(value.bound == "{"){
        //struct value
        let valO = [];
        value = value.contents;
        //parse
        while(value.length != 0){
          //get slot name
          let name = value.shift();
          typeCheck(name,"word");
          //remove :
          typeCheck(value.shift(),"token",":");
          //get value
          let val = parseValue(value.shift());
          //remove end-of-line
          if(value.length != 0){
            typeCheck(value.shift(),"token",",");
          }
          //return
          valO.push({name,value:val});
        }
        //return
        value = {type:"struct",value:valO};
      } else if(value.bound == "["){
        //array value
        let valO = [];
        value = value.contents;
        //parse
        while(value.length != 0){
          //get value
          valO.push(parseValue(value.shift()));
          //remove end-of-line
          if(value.length != 0){
            typeCheck(value.shift(),"token",",");
          }
        }
        //return
        value = {type:"array",value:valO};
      }
    } else if(!(
      value.type == "word" ||
      value.type == "string"
    )){
      error("Expected word, string, or enclose, but got "+value.type,value);
    }
    //numbers, hex, binary, and null
    if(value.type == "word"){
      if(/^\d+$/.test(value.value)){
        //decimal
        value.type = "int";
      } else if(value.value.slice(0,2) == "0x"){
        //hexadecimal
        value.type = "hex";
      } else if(
        value.value[value.value.length - 1] == "b" &&
        /^[01]+$/
        .test(value.value.slice(value.value.length-1))
      ) {
        //binary
        value.type = "binary";
      } else if(value.value == "null"){
        value.type = "null";
      }
    }
    //return
    return value;
  }

  function parseCodeBlock(code){
    let o = [];
    while(code.length > 0){
      //get line
      let line = [];
      while(
        code[0].type != "token"
        || code[0].value != ";"
      ) line.push(code.shift());
      code.shift();
      //parse
      o.push(parseCodeLine(line));
    }
    //return
    return o;
  }

  function parseCodeLine(line){
    let o = [];
    //get line type
    let lineTypeF = line.shift();
    let lineType = lineTypeF.value;
    typeCheck(lineTypeF,"word");
    //parse line
    if(lineType == "asm"){
      //get string
      let str = line.shift();
      typeCheck(str,"string");
      //return
      o.push({type:"asm",value:str});
    } else if(lineType == "set"){
      //get dest
      let dest = parseExpression(line);
      //remove =
      typeCheck(line.shift(),"token","=");
      //parse expression
      let exp = parseExpression(line);
      //return
      o.push({type:"set",dest,exp});
    } else if(lineType == "define"){
      //get type
      let type = parseType(line);
      line = type.rest;
      type = type.value;
      //get name
      let name = line.shift();
      typeCheck(name,"word");
      //remove =
      typeCheck(line.shift(),"token","=");
      //get starting value
      let value = parseValue(line.shift());
      //return
      o.push({
        type:"define",valType:type,name,value
      });
    } else if(lineType == "for"){
      //parse params
      let params = line.shift();
      typeCheck(params,"enclose");
      params = params.contents;
      let init = [];
      while(
        params[0].type != "token"
        || params[0].value != ";"
      ) {
        init.push(params.shift());
      }
      params.shift();
      let condition = [];
      while(
        params[0].type != "token"
        || params[0].value != ";"
      ) {
        condition.push(params.shift());
      }
      params.shift();
      init = parseCodeLine(init);
      condition = parseExpression(condition);
      let update = parseCodeLine(params);
      //parse body
      let body = line.shift();
      typeCheck(body,"enclose");
      body = parseCodeBlock(body.contents);
      //return
      o.push({
        type:"for",init,condition,update,body
      });
    } else if(lineType == "if"){
      let chain = [];
      //parse if
      let condition = line.shift();
      typeCheck(condition,"enclose");
      condition = parseExpression(condition.contents);
      let body = line.shift();
      typeCheck(body,"enclose");
      body = parseCodeBlock(body.contents);
      chain.push({type:"if",condition,body});
      //parse elif / elses
      while(line.length > 0){
        //get type
        let typeR = line.shift();
        typeCheck(typeR,"word");
        let type = typeR.value;
        //parse
        if(type == "elif"){
          //elif
          let condition = line.shift();
          typeCheck(condition,"enclose");
          condition = parseExpression(condition.contents);
          let body = line.shift();
          typeCheck(body,"enclose");
          body = parseCodeBlock(body.contents);
          chain.push({type:"elif",condition,body});
        } else if(type == "else"){
          //else
          let body = line.shift();
          checkType(body,"enclose");
          body = parseCodeBlock(body.contents);
          chain.push({type:"else",body});
        } else {
          error("Expected \"elif\" or \"else\", got \""+type+"\"",typeR);
        }
      }
      //return
      out.push({type:"if",chain});
    } else if(lineType == "while"){
      //parse condition
      let condition = line.shift();
      typeCheck(condition,"enclose");
      condition = parseExpression(condition.contents);
      //parse body
      let body = line.shift();
      typeCheck(body,"enclose");
      body = parseCodeBlock(body.contents);
      //return
      o.push({type:"while",condition,body});
    } else if(lineType == "call"){
      //get name
      let name = line.shift();
      typeCheck(name,"word");
      //get params
      let params = line.shift();
      typeCheck(params,"enclose");
      //parse params
      params = parseCall(params.contents);
      //return
      o.push({type:"call",name,params});
    } else {
      console.error(o);
      error("Expected line start, got \""+lineType+"\"",lineTypeF);
    }
    //check for excess
    if(line.length != 0) error("Excess after expected end of line",line[0]);
    //return
    return o[0];
  }

  function parseExpression(line){
    //parse expression
    let o = [];
    while(true){
      //get value
      let value = line.shift();
      //check for call / access
      if(value.bound == "("){
        //call
        o.push({
          type:"call",params:
          parseCall(value.contents)
        });
      } else if(value.bound == "["){
        //access
        o.push({
          type:"access",index:
          parseExpression(value.contents)
        });
      } else if(value.type == "token"){
        //operator
        o.push({type:"operator",value});
      } else {
        //normal value
        o.push({
          type:"value",value:parseValue(value)
        });
      }
      //possible end
      if(
        line.length == 0 || 
        (line[0].type == "token" && line[0].value == "=")
      ) break;
    }
    //determine precidence
    return o;
  }

  function parseCall(params){
    //split
    let args = [];
    let cur = [];
    for(let p of params){
      if(p.type == "token" && p.value == ","){
        args.push(cur);
        cur = [];
      } else {
        cur.push(p);
      }
    }
    args.push(cur);
    //parse args
    args = args.map(parseExpression);
    //return
    return args;
  }

  //export
  return {lex,parseStructureBlock};
})();

function collectType(sb,n,o=[]){
  for(let c of sb){
    if(c.type == n){
      o.push(c);
    } else if(c.type == "namespace"){
      collectFunctions(sb,o);
    }
  }
  return o;
}

function branchify(contents,lprefix=""){
  let o = [];
  let nextLable = 0;
  for(let c of contents){
    if(c.type == "while"){
      //create and add lable
      let lable = lprefix+"for_"+nextLable;
      nextLable++;
      o.push({type:"lable",value:lable});
      //branchify body
      c.body = branchify(c.body,lable+"_");
      //rotate condition
      c.body.push({
        type:"branch",
        condition:c.condition,
        to:lable
      });
      //add body
      o = o.concat(c.body);
    } else if(c.type == "for"){
      //pop out initilization
      o.push(c.init);
      //create and add lable
      let lable = lprefix+"for_"+nextLable;
      nextLable++;
      o.push({type:"lable",value:lable});
      //branchify body
      c.body = branchify(c.body,lable+"_");
      //rotate update
      c.body.push(c.update);
      //rotate condition
      c.body.push({
        type:"branch",
        condition:c.condition,
        to:lable
      });
      //add body
      o = o.concat(c.body);
    } else if(c.type == "if"){
      //create base lable
      let bLable = lprefix+"if_"+nextLable+"_";
      nextLable++;
      //create end lable
      let endLable = bLable + "end";
      //create chain lables
      let nsl = 0;
      for(let e of c.chain){
        e.startLable = bLable+e.type+"_"+nsl;
        nsl++;
      }
      //add condition chain
      for(let e of c.chain){
        o.push({
          type:"branch",
          condition:e.condition,
          to:e.startLable
        });
      }
      //add exit jumps and start lables
      for(let e of c.chain){
        e.body.unshift({
          type:"lable",value:e.startLable
        });
        e.body.push({type:"branch",to:endLable});
      }
      //branchify bodies
      for(let e of c.chain){
        e.body = branchify(
          e.body,e.startLable+"_"
        );
      }
      //add bodies
      for(let e of c.chain){
        o = o.concat(e.body);
      }
      //add end lable
      o.push({type:"lable",value:endLable});
    } else o.push(c);
  }
  return o;
}

const nameResolution = (()=>{
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
      if(this.values[name]) return this.value[name];
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
        error("Name \""+n.value+"\" not defined",n);
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
      if(collision) error("Name collision over "+collision.value+formAt(collision),c);
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
      nameResolveExpression(c.condition,scope);
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
  return {defCollect,nameResolve,finishResolution};
})();

function structResolve(structs){
  //resolved structs
  let o = [];
  //structs to resolve
  let toRes = structs.slice();
  //next set of structs to resolve
  let next = [];
  //has anything been done this loop
  let resolveDone = false;
  //loop
  while(toRes.length > 0){
    for(let s of toRes){
      //check if resolvable
      if((!s.conforms) || (o.filter(r=>{
        return r.name.value
          == s.conforms.value
      }).length != 0)){
        //move line info to base
        s.line = s.name.line;
        s.column = s.name.column;
        s.name = s.name.value;
        //neaten slots
        for(let sl of s.slots){
          sl.name = sl.name.value;
        }
        s.slotsR = s.slots;
        s.slots = {};
        //add length
        s.length = 0;
        //add conform info
        if(s.conforms){
          //get conformee
          let conformee = o.filter(r=>{
            return r.name.value
              == s.conforms.value
          })[0];
          //prepend slot info
          s.slots = Object.assign(
            s.slots,conformee.slots
          );
          //update length info
          s.length = conformee.length;
        }
        //remove conform
        delete s.conforms;
        //resolve slots
        for(let sl of s.slotsR){
          s.slots[sl.name] = {
            type:sl.type,
            index:s.length
          };
          s.length++;
        }
        //remove slotsR
        delete s.slotsR;
        //add to output
        o.push(s);
        //struct has been resolved!
        resolveDone = true;
      } else {
        //que for next iteration
        next.push(s);
      }
    }
    //update toRes
    toRes = next;
    next = [];
    //check for errors
    if(!resolveDone){
      error(
        "Struct "+toRes[0].name.value
        +" could not be resolved",
        toRes[0].name
      );
    }
    resolveDone = false;
  }
  //return
  return o;
}

const decomposeExpressions = (()=>{
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
    } else if(l.type == "branch"){
      l.condition = dExpression(l.condition);
    }
  }

  //actual decomposition
  function dExpression(e){
    //access and call
    e = (e=>{
      let o = [];
      for(c of e){
        if(c.type == "call"){
          //get name
          let name = o.pop();
          if(!name) error("Cannot start an expression with a call");
          //decompose params
          let params = dCall(c.params);
          //add back to expression
          o.push({type:"call",name,params});
        } else if(c.type == "access"){
          //get thing
          let thing = o.pop();
          if(!thing) error("Cannot start an expression with an access");
          //decompose index
          let index = dExpression(c.index);
          //add back to expression
          o.push({type:"access",thing,index});
        } else if(c.type != "operator" && c.type != "value"){
          o.push({type:"value",value:c});
        } else {
          o.push(c);
        }
      }
      return o;
    })(e);
    //!
    e = (e=>{
      let o = [];
      while(e.length != 0){
        let cur = e.shift();
        if(cur.type == "token" && cur.value == "!"){
          //get value to invert
          let val = e.shift();
          if(!val) error("cannot end and expression with !",cur);
          //add
          o.push({type:"!",value:val});
        } else {
          o.push(cur);
        }
      }
      return o;
    })(e);
    //->  & | ^  * / %  + -  && || ^^ !!  > < ==
    for(let o of [
      "->",
      "&","|","^",
      "*","/","%",
      "+","-",
      "&&","||","^^","!!",
      ">","<","=="
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
  return {decomposeExpressions};
})();

const expandExprs = (()=>{

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
        let to = backResolve(g,o,temps,c.dest,null,true);
        let f = backResolve(g,o,temps,c.exp,to);
        if(!to){
          o[o.length-1].value = f;
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
    if(exp.type){
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
          o.push({
            type:"derefNset",
            thing,index
          });
          return;
        }
        //get destination
        if(!to){
          to = getTemp(
            g,temps,varType(g,thing).subType
          );
        }
        //add
        o.push({
          type:"dereference",
          thing,index,to
        });
        return {type:"word",value:to};
      } else if(exp.type == "call"){
        //resolve call
        exp.name = exp.name.value
        backResolveCallParams(g,o,temps,exp,to);
      } else if(exp.type == "value"){
        if(left){
          return exp.value;
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
          error("Indirect struct access is not supported");
        }
        if(
          exp.b.value.value == "length" &&
          varType(g,exp.a.value).name.value
            == "array"
        ){
          if(left) error("Cannot use array length as set destination");
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
          //get destination
          if(!to){
            to = getTemp(
              g,temps,slot.type
            );
          }
          //left-side logic
          if(left){
            o.push({
              type:"derefNset",
              thing:exp.a.value,index:slot.index
            });
            return
          }
          //add
          o.push({
            type:"dereference",
            thing:exp.a.value,index:slot.index,to
          });
          return {type:"word",value:to};
        }
      } else {
        if(left){
          console.error(exp);
          error("Cannot use arithmatic in left side")
        }
        //resolve a
        let a = backResolve(
          g,o,temps,exp.a
        );
        //resolve b
        let b = backResolve(
          g,o,temps,exp.b
        );
        //get destination
        if(!to){
          to = getTemp(
            g,temps,{name:{type:"word",value:"number"}}//temp fix
          );
        }
        //add
        o.push({
          type:"op",
          opType:exp.type,
          a,b,to
        });
        return {type:"word",value:to};
      }
    } else {
      if(left){
        return exp[0].value;
      }
      //value
      exp = exp[0];
      if(exp.type == "value")
        exp.type = varType(g,exp);
      exp.type = toType(exp.type);
      //get destination
      if(!to){
        //get temp
        to = getTemp(g,temps,exp.type);
      }
      //set destination
      o.push({type:"set",dest:to,value:exp});
      return {type:"word",value:to};
    }
  }

  function typeStr(t){
    let o = t.name.value+"";
    if(t.subType){
      o += "["+typeStr(t.subtype)+"]";
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
      error("Compound type constants in expressions are not supported, had type "+t)
    }
  }

  function varType(g,varN){
    return g.define[varN.value].valType;
  }

  //export
  return {expand};
})();

function extractLDefs(contents){
  let defs = [];
  for(let l of contents){
    if(l.type == "define"){
      defs.push(Object.assign({},l));
      l.type = "set";
      l.exp = [l.value];
      l.dest = [l.name];
      delete l.name;
      delete l.valType;
      delete l.value;
    } else if(l.type == "for"){
      defs = defs
        .concat(extractLDefs([l.init]))
        .concat(extractLDefs(l.body));
    }
  }
  return defs;
}

const neaten = (()=>{

  function neatenDefine(defines){
    let o = {};
    for(let d of defines){
      d.line = d.name.line;
      d.column = d.name.column;
      o[d.name.value] = d;
      delete d.name;
      //array length determination
      if(d.valType.name.value == "array"){
        if(d.value.type == "int"){
          d.length = d.value.value*1;
        } else if(
          d.value.type == "string" ||
          d.value.type == "array"
        ){
          d.length = d.value.value.length;
        } else {
          error("Cannot use type "+d.value.type+" as array initial value",d.value);
        }
      }
    }
    return o;
  }

  function neatenFunction(fs){
    for(let f of fs){
      f.line = f.name.line;
      f.column = f.name.column;
      f.name = f.name.value;
    }
  }

  //export
  return {neatenDefine,neatenFunction};
})();

const stringify = (()=>{

  function valify(v){
    if(typeof(v)=="string") return v;
    if(typeof(v.type)!="string"){
      v.type = v.type.value || v.type.name;
    }
    if(v.type == "null"){
      v = 0;
    } else if(v.type == "int" || v.type == "number"){
      v = v.value*1;
    } else if(v.type == "word"){
      v = v.value;
    }
    return v;
  }

  function stringifyF(f){
    let o = "";
    if(!f.stackless){
      //
    } else {
      //function definition
      o += "!defU defF "+f.name+"\n\n";
      //contents
      for(let c of f.contents){
        if(c.type == "asm"){
          o += c.value.value;
        } else if(c.type == "set"){
          o += "TRS "+valify(c.value)+","+valify(c.dest);
        } else if(c.type == "dereference"){
          //ofset index
          o += "TRS OP+,ALU-C\n";
          o += "TRS "+valify(c.thing)+",ALU-A\n";
          o += "TRS "+valify(c.index)+",ALU-B\n";
          o += "TRS ALU-O,$1\n";
          o += "TRS #0,"+valify(c.to);
        } else if(c.type == "op"){
          //setup op
          o += "TRS OP"+c.opType+",ALU-C\n";
          //a
          o += "TRS "+valify(c.a)+",ALU-A\n";
          //b
          o += "TRS "+valify(c.b)+",ALU-B\n";
          //o
          o += "TRS ALU-O,"+valify(c.to);
        } else if(c.type == "branch"){
          o += "!defU cJump "+c.condition.value+" "+c.to;
        } else if(c.type == "lable"){
          o += "LBL "+c.value;
        }
        o += "\n\n";
      }
      //definition termination
      o += "!defU retF "+f.name;
    }
    return o;
  }

  function asmVal(v){
    if(v+"" == "null"){
      return "0";
    } else if(typeof(v*1)=="number"){
      return v;
    } else if(typeof(v)=="string"){
      return "&"+v;
    }
  }

  function stringifyD(ds,structs){
    //output string
    let o = "";
    //loop through definitions
    for(let n of Object.keys(ds)){
      let d = ds[n];
      if(d.valType.name.value == "array"){
        //array
        let a = [];
        if(d.value.type == "int"){
          for(let i=0;i<d.value.value;i++) a.push(0);
        } else if(d.value.type == "string"){
          a = d.value.value.split("");
        } else if(d.value.type == "array"){
          a = d.value.value.map(valify);
        } else {
          error("Invalid array value type \""+d.value.type+"\"",d);
        }
        //null-terminate
        a.push(0);
        //pad to even length
        if(a.length % 2 != 0) a.push(0);
        //add header
        o += "LBL "+n+"\n";
        //join
        while(a.length > 0){
          o += "TRS #"+asmVal(a.shift())+
            ",#"+asmVal(a.shift())+"\n";
        }
      } else if(
        ["char","int","null","number"]
        .indexOf(d.valType.name.value) != -1
      ){
        //simple type
        o += "DEF "+n+","+asmVal(d.value.value)+"\n";
      } else {
        //struct
        if(
          d.value.type != "struct" &&
          d.value.type != "null"
        ) error("Cannot use type \""+d.value.type+"\" as struct value",d);
        o += "LBL "+n+"\n";
        let complete = true;
        let t = structs.filter(s=>{
          return s.name == d.valType.name.value;
        })[0];
        for(let s of Object.keys(t.slots)){
          let v = d.value.value.filter(p=>{
            return p.name.value == s;
          })[0] || {value:{type:"null",value:null}};
          if(complete){
            o += "TRS "+valify(v.value)+",";
            complete = false;
          } else {
            o += valify(v.value)+"\n";
            complete = true;
          }
        }
        if(!complete) o += "#0\n"
      }
      o += "\n"
    }
    //return
    return o;
  }

  //export
  return {stringifyF,stringifyD};
})();

function compile(program,root){
  error.file = program;
  //lex
  program = parsing.lex(program);
  //parse
  program = parsing.parseStructureBlock(program);
  //collect components
  let functions = collectType(program,"function");
  let structs = collectType(program,"struct");
  let metadata = collectType(program,"metadata");
  let defines = collectType(program,"define");
  //branchify functions
  functions.map(f=>{
    f.contents = branchify(f.contents);
  });
  //name resolution for definitions
  //and definition collection
  program = {contents:program};
  nameResolution.defCollect(program);
  //finish name resolution
  nameResolution.nameResolve(program);
  //remove namespaces and scopes
  nameResolution.finishResolution(program);
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
  let output = 
    ";----------------;\n"+
    "; Default Header ;\n"+
    ";----------------;\n\n"+
    "!link utils/macros.txt\n\n";
  //userspace header
  metadata.forEach(m=>{
    if(m.key.value == "header"){
      output = readFileSync(root+"headers/"+m.value.value)+output;
    }
  });
  //code
  output += functions + defines;
  //return
  return output
}

const {readFileSync} = require("fs");
const {serve} = require("../../utils/ioWrap.js");

serve((d,params)=>{
  if(!params[0]) error("No build root!");
  let o = compile(d,params[0]);
  return o;
});
