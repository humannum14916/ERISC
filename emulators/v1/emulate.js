const read = require("fs").readFileSync;
const {decHex,hexDec} = require("../../utils/convert.js");

f/*module.exports*/ = async function(bootf,diskf,keyBuffer){
  //memory class
  class Memory{
    constructor(lsFile,blank=false){
      if(blank){
        this.mem = [];
      } else {
        //remove header
        lsFile = lsFile.slice(9);
        //split at lines
        lsFile = lsFile.split("\n");
        //split at spaces
        let mem = [];
        for(let l of lsFile){
          mem = mem.concat(l.split(" "));
        }
        //remove blank lines
        mem = mem.filter(a=>{return a != ""});
        //convert to decimal and store
        this.mem = mem.map(a=>{return hexDec(a)});
      }
    }
    read(adr){
      return this.mem[adr] || 0;
    }
    write(adr,data){
      this.mem[adr] = data;
    }
  }
  //RAM / ROM class
  class RamRom{
    constructor(ram,rom){
      this.type = "RamRom";
      this.ram = ram;
      this.rom = rom;
      this.romEnabled = true;
    }
    busRead(bus){
      if(hexDec(bus.adr)<hexDec("f000")){
        if(this.romEnabled){
          return this.rom.read(hexDec(bus.adr));
        } else {
          return this.ram.read(hexDec(bus.adr));
        }
      }
      return null;
    }
    busWrite(bus){
      if(hexDec(bus.adr)<hexDec("f000")){
        if(this.romEnabled){
          error("Attempt to write to ROM adr "+bus.adr);
        } else {
          return this.ram.write(hexDec(bus.adr),bus.data);
        }
      }
    }
  }
  //ALU class
  class ALU{
    constructor(){
      this.type = "ALU";
      this.inputA = 0;
      this.inputB = 0;
      this.config = 0;
    }
    busRead(bus){
      if(bus.adr == "fffb"){
        return this.inputA;
      } else if(bus.adr == "fffc"){
        return this.inputB;
      } else if(bus.adr == "fffa"){
        return this.config;
      } else if(bus.adr == "fffd"){
        return this.calculate();
      }
      return null;
    }
    busWrite(bus){
      if(bus.adr == "fffb"){
        this.inputA = bus.data;
      } else if(bus.adr == "fffc"){
        this.inputB = bus.data;
      } else if(bus.adr == "fffa"){
        this.config = bus.data;
      } else if(bus.adr == "fffd"){
        error("Attempt to write to ALU output");
      }
    }
    calculate(){
      if(this.config == 0){
        return this.inputA + this.inputB;
      } else if(this.config == 2){
        return (this.inputA == this.inputB)?1:0;
      } else if(this.config == 32){
        let r = this.inputA - this.inputB;
        if(r < 0) error("Subtraction between "+this.inputA+" and "+this.inputB+" yeilded negative result");
        return r;
      } else if(this.config == 1){
        return (this.inputA > this.inputB)?1:0;
      } else {
        error("Undefined ALU config: "+this.config);
      }
    }
  }
  //status lcd class
  class LCD{
    constructor(){
      this.type = "LCD";
      this.status = 0;
    }
    busRead(bus){
      if(bus.adr == "fff9") return this.status;
      return null;
    }
    busWrite(bus){
      if(bus.adr == "fff9"){
        this.status = bus.data;
        refreshDisplay();
      }
    }
    refreshDisplay(){
      let status = {
        "0":"Uninitialized",
        "1":"Working",
        "2":"Idle",
        "3":"Loading Program",
        "4":"Loading Data",
        "5":"Halted",
        "ffff":"Induced Crash",
        "fffe":"EvalPath - Not Directory Error",
        "fffd":"EvalPath - Not Found Error",
        "fffc":"KernelFunction - Not Found Error"
      }[decHex(this.status)];
      return {
        priority:0,
        message:"-----\nStatus: "+decHex(this.status)+" ("+status+")",
      };
    }
  }
  //text terminal class
  class TTY{
    constructor(){
      this.type = "TTY";
      this.lines = "";
    }
    busRead(bus){
      if(bus.adr == "fff8"){
        error("Attempt to read TTY input");
      }
      return null;
    }
    busWrite(bus){
      if(bus.adr == "fff8"){
        const ascii = [
          " ","!","\"","#","$","%","&","'","(",")","*","+",",","-",".","/",
          "0","1","2","3","4","5","6","7","8","9",":",";","<","=",">","?",
          "@","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O",
          "P","Q","R","S","T","U","V","W","X","Y","Z","[","\\","]","^","_",
          "`","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o",
          "p","q","r","s","t","u","v","w","x","y","z","{","|","}","~"
        ];
        let char = ascii[bus.data-32];
        if(bus.data == 10) char = "\n";
        if(!char){
          //error("TTY: Invalid character "+decHex(bus.data)+"("+bus.data+")");
          char = "<"+decHex(bus.data)+">";
        }
        this.lines += char;
        //check for scroll
        if(
          this.lines.split("").filter(
            c=>{return c=="\n"}
        ).length >= 16){
          this.lines = this.lines.slice(
            this.lines.indexOf("\n")+1
          );
        }
        //update display
        refreshDisplay();
      }
    }
    refreshDisplay(){
      return {
        priority:5,
        message:this.lines,
      };
    }
  }
  //keyboard class
  class Keyboard{
    constructor(){
      this.type = "Keyboard";
      this.buffer = [];
      process.stdin.on("data",m=>{
        let decoded = m.toString();
        //decoded = decoded.slice(0,decoded.length-1);
        if(decoded == "!!!CRASH!!!\n") error("Crash requested");
        decoded = decoded.replace("\\n","\n");
        const ascii = [
          " ","!","\"","#","$","%","&","'","(",")","*","+",",","-",".","/",
          "0","1","2","3","4","5","6","7","8","9",":",";","<","=",">","?",
          "@","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O",
          "P","Q","R","S","T","U","V","W","X","Y","Z","[","\\","]","^","_",
          "`","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o",
          "p","q","r","s","t","u","v","w","x","y","z","{","|","}","~"
        ];
        this.buffer = this.buffer.concat(decoded.split("").map(d=>{
          if(d == "\n") return 10;
          return ascii.indexOf(d)+32;
        }));
        refreshDisplay();
      });
    }
    busRead(bus){
      if(bus.adr == "fff7") return this.buffer[0];
      return null;
    }
    busWrite(bus){
      if(bus.adr == "fff7"){
        this.buffer = this.buffer.slice(1);
        refreshDisplay();
      }
    }
    refreshDisplay(){
      if(this.buffer.length == 0) return;
      return {
        priority:-1,
        message:"Input Buffer:"+this.buffer.map(decHex),
      };
    }
    get interrupting(){
      return this.buffer.length != 0;
    }
  }
  //hard disk class
  class HardDisk{
    constructor(disk){
      this.type = "HardDisk";
      this.disk = disk;
      this.sourceH = 0;
      this.sourceL = 0;
      this.transferLen = 0;
      this.dest = 0;
      this.requestBusMaster = 0;
      this.transferScan = 0;
    }
    busRead(bus){
      if(bus.adr == "fff6"){
        return this.sourceH;
      } else if(bus.adr == "fff5"){
        return this.sourceL;
      } else if(bus.adr == "fff4"){
        return this.transferLen;
      } else if(bus.adr == "fff3"){
        return this.dest;
      } else if(bus.adr == "fff2"){
        error("Attempt to read hard drive transfer initiation adress");
      }
      return null;
    }
    busWrite(busi){
      if(busi.adr == "fff6"){
        this.sourceH = busi.data;
      } else if(busi.adr == "fff5"){
        this.sourceL = busi.data;
      } else if(busi.adr == "fff4"){
        this.transferLen = busi.data;
      } else if(busi.adr == "fff3"){
        this.dest = busi.data;
      } else if(busi.adr == "fff2"){
        this.transferScan = 0;
        this.requestBusMaster = 2;
        getBusDevice("RamRom").romEnabled = false;
      }
    }
    takeCycle(){
      //get word from disk
      let word = this.disk.read(hexDec(
        decHex(this.sourceH)+decHex(this.sourceL)
      )+this.transferScan);
      //write word to bus
      busWrite(
        decHex(this.dest+this.transferScan),word
      );
      /*/loading log
      refreshDisplay();
      console.log(
        "Loading... "+this.transferScan
        +"/"+this.transferLen+" "
        +Math.floor(100*(
          this.transferScan
          /this.transferLen
        ))+"%");*/
      //next adress
      this.transferScan++
      //check for end
      if(this.transferScan >= this.transferLen){
        this.requestBusMaster = 0;
      }
    }
  }
  //program counter class
  class ProgCounter{
    constructor(){
      this.type = "ProgCounter";
      this.interruptPC = 0;
      this.mainPC = 0;
      this.interruptStart = hexDec("fe");
      this.selectedPC = "main";
    }
    getSelectedPC(){
      if(this.selectedPC == "main"){
        return this.mainPC;
      } else if(this.selectedPC == "interrupt"){
        return this.interruptPC;
      }
    }
    incPC(){
      if(this.selectedPC == "main"){
        this.mainPC++
      } else if(this.selectedPC == "interrupt"){
        this.interruptPC++
      }
    }
    setPC(interrupt){
      this.selectedPC = (interrupt
        && this.interruptStart != 0)
        ?"interrupt":"main";
      if(this.selectedPC == "main"){
        this.interruptPC = this.interruptStart;
      }
    }
    busRead(bus){
      //primary access
      if(bus.adr == "ffff"){
        if(this.selectedPC == "main"){
          return this.mainPC;
        } else if(this.selectedPC == "interrupt"){
          return this.interruptPC;
        }
      }
      //secondary access
      if(bus.adr == "fffe"){
        if(this.selectedPC == "interrupt"){
          return this.mainPC;
        } else if(this.selectedPC == "main"){
          return this.interruptPC;
        }
      }
      return null;
    }
    busWrite(bus){
      //primary access
      if(bus.adr == "ffff"){
        if(this.selectedPC == "main"){
          this.mainPC = bus.data;
        } else if(this.selectedPC == "interrupt"){
          this.interruptPC = bus.data;
        }
      }
      //secondary access
      if(bus.adr == "fffe"){
        if(this.selectedPC == "interrupt"){
          this.mainPC = bus.data;
        } else if(this.selectedPC == "main"){
          this.interruptStart = bus.data;
          this.interruptPC = bus.data;
        }
      }
    }
    /*refreshDisplay(){
      return {
        priority:-0.25,
        message:"PC:"+decHex(this.getSelectedPC()),
      };
    }*/
  }
  //cpu class
  class ERISCcpu{
    constructor(){
      this.type = "ERISCcpu";
      this.pc = new ProgCounter();
      bus.splice(
        bus.indexOf(getBusDevice("BusFirewall")),
        0,this.pc
      );
      this.requestBusMaster = 1;
      this.blanksRun = 0;
    }
    busRead(){return null}
    busWrite(){}
    takeCycle(){
      //get instruction from adress
      let instrFromAdr = decHex(this.pc.getSelectedPC());
      //get from adress
      let instrFrom = decHex(busRead(instrFromAdr));
      //inc PC
      this.pc.incPC();
      //get data
      let data = busRead(instrFrom);
      //get instruction to adress
      let instrToAdr = decHex(this.pc.getSelectedPC());
      //get to adress
      let instrTo = decHex(busRead(instrToAdr));
      //inc PC
      this.pc.incPC();
      //write data
      busWrite(instrTo,data);
      //update PC interrupt status
      this.pc.setPC(getBusInterruptStatus());
      //check for blank
      if(instrFrom == 0 && instrTo == 0){
        this.blanksRun++
        if(this.blanksRun >= 3){
          error("Errorous jump suspected - 3 sequential 0-0 instructions",50);
        }
      } else {
        this.blanksRun = 0;
      }
      //check for misalignment
      if(this.pc.getSelectedPC()%2!=0){
        error("PC not %2 aligned (value "+decHex(this.pc.getSelectedPC())+")");
      }
    }
  }
  //bus firewall class
  class BusFirewall{
    constructor(){
      this.type = "BusFirewall";
      //registers
      this.pageLength = 0;
      this.pageSource = 0;
      //status
      this.active = false;
      this.activeInterrupt = false;
    }
    checkActive(){
      return false;
      if(getBusDevice("ProgCounter").selectedPC=="main"){
        return this.activeInterrupt;
      } else {
        return this.active;
      }
    }
    setActive(value){
      if(getBusDevice("ProgCounter").selectedPC=="main"){
        this.activeInterrupt = value;
      } else {
        this.active = value;
      }
    }
    busRead(bus){
      //firewalling
      if(this.checkActive() && bus.adr != "ffff"){
        if(
          hexDec(bus.adr) < this.pageLength
        ){
          return {
            val:null,
            adrOverride:decHex(
              hexDec(bus.adr)+this.pageSource),
          }; //allow reads to memory page
        } else {
          //outside of page and not pc, error
          return {endCycle:true};
          //error("Attempt to read adress "+bus.adr+", outside of memory page (source:"+decHex(this.pageSource)+", length:"+decHex(this.pageLength)+")");
        }
      }
      //registers
      if(bus.adr == "fff1"){
        return this.pageLength;
      } else if(bus.adr == "fff0"){
        return this.pageSource;
      }
      return null;
    }
    busWrite(bus){
      //firewalling
      if(this.checkActive() && bus.adr != "ffff"){
        if(hexDec(bus.adr) < this.pageLength){
          return {
            adrOverride:decHex(
              hexDec(bus.adr)+this.pageSource),
          };//allow writes to memory page
        } else {
          //outside of page and not pc, error
          return {endCycle:true};
          //error("Attempt to write "+bus.data+" to adress "+bus.adr+", outside of memory page (source:"+decHex(this.pageSource)+", length:"+decHex(this.pageLength)+")");
        }
      }
      //activation status
      if(
        bus.adr == "ffff" && bus.data == 0 &&
        cycleMaster == getBusDevice("ERISCcpu")
      ){
        this.setActive(!this.checkActive());
      }
      //registers
      if(bus.adr == "fff1"){
        this.pageLength = bus.data;
      } else if(bus.adr == "fff0"){
        this.pageSource = bus.data;
      }
    }
  }

  //error reporter
  function error(e,historyLen=10){
    console.log("-----");
    console.log("Emulation error:");
    console.log(e);
    console.log();
    //console.log("Cycle #"+tickNum);
    let ramRom = getBusDevice("RamRom");
    let mem = ramRom.romEnabled?ramRom.rom:ramRom.ram;
    let instr = Math.floor(
      getBusDevice("ProgCounter").getSelectedPC()/2)*2;
    let instrR = instr;
    let bf = getBusDevice("BusFirewall");
    if(bf.checkActive() && instr < bf.pageLength){
      instr += bf.pageSource;
      console.log("Bus Firewall:");
      console.log("Source: "+decHex(bf.pageSource));
      console.log("Length: "+decHex(bf.pageLength))
      console.log();
    }
    console.log("Instruction:");
    console.log(
      decHex(mem.read(instr))+" "
      +decHex(mem.read(instr+1)));
    console.log("At adress "+decHex(instrR));
    console.log();
    console.log("Bus history (newest first):");
    busHistory.reverse();
    busHistory = busHistory.slice(0,historyLen);
    console.log(busHistory.join("\n"));
    console.log();
    console.log("Memory dump ("+(ramRom.romEnabled?"ROM":"RAM")+"):");
    let memS = "";
    let addLine = 8;
    let adr = 0;
    console.log(" adr| 0/8  1/9  2/a  3/b  4/c  5/d  6/e  7/f");
    console.log("----+---------------------------------------");
    for(let w of mem.mem){
      if(addLine == 8){
        addLine = 0;
        let s = decHex(adr);
        while(s.length < 4) s = " "+s;
        memS += "\n"+s+"|";
        adr += 8;
      } else {
        memS += " ";
      }
      let s = decHex(w);
      if(s == "undefined") s = "----";
      while(s.length < 4) s = " "+s;
      memS += s;
      addLine++
    }
    console.log(memS.slice(1));
    process.exit(1);
  }

  //read inputs
  console.log("Loading files...");
  const bootRom = new Memory(read(bootf,"utf8"));
  const disk = new Memory(read(diskf,"utf8"));
  console.log("Files loaded");

  //create bus
  console.log("Creating bus...");
  const bus = [
    //CPU
    new ALU(),
    new LCD(),
    new BusFirewall(),
    //PC
    new RamRom(new Memory("",true),bootRom),
    new TTY(),
    new Keyboard(),
    new HardDisk(disk),
  ];
  bus.unshift(new ERISCcpu());
  console.log("Bus created");

  //bus access functions
  function busRead(adr){
    busHistory.push(
      ((getBusDevice("ProgCounter").selectedPC=="main")?"":"*")+
      "Read from "+adr+"...");
    //create bus status
    let busP = {adr:adr+""};
    let returns = [];
    for(let d of bus){
      let r = d.busRead(busP);
      if(r != null){
        if(r.endCycle){
          break;
        } if(r.adrOverride){
          busP.adr = r.adrOverride;
        } else if(r.val){
          returns.push(r.val);
        } else {
          returns.push(r);
        }
      }
    }
    if(returns.length>1){
      error("Multiple returns for bus read at adress "+adr);
    }
    if(returns.length<1){
      error("No returns for bus read at adress "+adr);
    }
    busHistory.pop();
    busHistory.push(
      ((getBusDevice("ProgCounter").selectedPC=="main")?"":"*")+
      "Read from "+adr+", value "+decHex(returns[0]));
    return returns[0];
  }
  function busWrite(adr,data){
    busHistory.push(
      ((getBusDevice("ProgCounter").selectedPC=="main")?"":"*")+
      "Write to "+adr+", value "+decHex(data)+"...");
    for(let d of bus){
      let r = d.busWrite({adr:adr+"",data:data});
      if(r){
        if(r.endCycle){
          return;
        } else if(r.adrOverride){
          adr = r.adrOverride;
        }
      }
    }
    busHistory.pop();
    busHistory.push(
      ((getBusDevice("ProgCounter").selectedPC=="main")?"":"*")+
      "Write to "+adr+", value "+decHex(data));
  }
  function getBusInterruptStatus(){
    for(let d of bus){
      if(d.interrupting){
        return true;
      }
    }
    return false;
  }
  function getBusDevice(type){
    return bus.filter(d=>{
      return d.type == type;
    })[0];
  }
  
  //display refresher
  function refreshDisplay(){
    let ms = [];
    for(let d of bus){
      if(d.refreshDisplay){
        let r = d.refreshDisplay();
        if(!r) continue;
        ms.push(r);
      }
    }
    ms.sort((a,b)=>{
      return a.priority-b.priority;
    });
    ms.reverse();
    console.clear();
    for(let m of ms){
      console.log(m.message);
    }
  }

  //tick function
  function simulateCycle(){
    //determine bus master
    cycleMaster = {
      requestBusMaster:0,
      takeCycle:()=>{error("No bus master");}
    };
    for(let d of bus){
      let rbm = d.requestBusMaster;
      if(rbm > cycleMaster.requestBusMaster){
        cycleMaster = d;
      }
    }
    //tick device
    cycleMaster.takeCycle();
  }

  //start simulation
  console.log("Emulation started");
  refreshDisplay();
  let tickNum = 0;
  let busHistory = [];
  let cycleMaster;
  while(true){
    simulateCycle();
    await new Promise(r=>{setTimeout(r,0)});
    tickNum++;
  }
}

let is = process.argv[2]+"/";

f(is+"bootRom",is+"disk");
