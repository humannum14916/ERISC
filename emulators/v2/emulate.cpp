#include <iostream>
#include <sstream>
#include <fstream>
#include <unistd.h>
#include <sys/epoll.h>
#include <array>

using namespace std;


using EpollEvent_t = struct epoll_event;


//prototypes
void historyAdd(string m);
void log(string m);
string numToString(unsigned int n);
void error(string m);
void historyEdit(string m);
void noBusMaster();
unsigned int alu_calculate();
unsigned int busRead(unsigned int adr);
void busWrite(unsigned int adr, unsigned int data);
bool getBusInterruptStatus();
void error(string e,int historyLen);
unsigned int pc_getSelectedPC();
void pc_incPC();
void pc_setPC(bool interrupt);
void log(unsigned int m);
string decHex(unsigned int v);
void refreshDisplay();
void tty_scroll();

//type declarations
struct BusReturn {
  bool end;
  unsigned int adrOverride;
  unsigned int value;
  bool valReturned;
};

typedef BusReturn(*BusDeviceRead)(unsigned int);
typedef BusReturn(*BusDeviceWrite)(unsigned int, unsigned int);
typedef bool(*BusDeviceInt)();
typedef int(*BusDeviceRBM)();
typedef void(*BusDeviceTakeCycle)();

struct BusDevice {
  BusDeviceRead readDevice;
  BusDeviceWrite writeDevice;
  BusDeviceInt interruptStatus;
  BusDeviceRBM checkRBM;
  BusDeviceTakeCycle takeCycle;
};


//Simulation data
BusDevice bus[9];
string busHistory[50];
unsigned int alu_inputA = 0;
unsigned int alu_inputB = 0;
unsigned int alu_config = 0;
int cpu_blanksRun = 0;
unsigned int pc_interruptPC = 0;
unsigned int pc_mainPC = 0;
unsigned int pc_interruptStart = 0;
string pc_selectedPC = "main";
unsigned int busFirewall_pageLength = 0;
unsigned int busFirewall_pageSource = 0;
bool busFirewall_active = false;
bool busFirewall_activeInterrupt = false;
unsigned int memory_ram[0xfe00];
unsigned int memory_rom[0x1000];
bool memory_romEnabled = true;
unsigned int disk_disk[25536];
unsigned int disk_sourceH = 0;
unsigned int disk_sourceL = 0;
unsigned int disk_transferLen = 0;
unsigned int disk_dest = 0;
unsigned int disk_transferScan = 0;
bool disk_inTransfer = false;
unsigned int lcd_status = 0;
string tty_lines[16];
int tty_columns = 48;
string keyboard_buffer = "";

//Bus devices
BusReturn default_return = {false};
BusReturn default_readDevice(unsigned int adr){
  return default_return;
}
BusReturn default_writeDevice(unsigned int adr, unsigned int data){
  return default_return;
}
bool default_interruptStatus(){
  return false;
}
int default_checkRBM(){
  return 0;
}
BusReturn returnBasic(unsigned int data){
  BusReturn ret = {false, 0, data, true};
  return ret;
}
//CPU
void cpu_takeCycle(){
  //get instruction from adress
  unsigned int instrFromAdr =  pc_getSelectedPC();
  //get from adress
  unsigned int instrFrom = busRead(instrFromAdr);
  //inc PC
  pc_incPC();
  //get data
  unsigned int data = busRead(instrFrom);
  //get instruction to adress
  unsigned int instrToAdr = pc_getSelectedPC();
  //get to adress
  unsigned int instrTo = busRead(instrToAdr);
  //inc PC
  pc_incPC();
  //write data
  busWrite(instrTo,data);
  //update PC interrupt status
  pc_setPC(getBusInterruptStatus());
  //check for blank
  if(instrFrom == 0 && instrTo == 0){
    cpu_blanksRun++;
    if(cpu_blanksRun >= 3){
      error("Errorous jump suspected - 3 sequential 0-0 instructions",50);
    }
  } else {
    cpu_blanksRun = 0;
  }
  //check for misalignment
  if(pc_getSelectedPC()%2!=0){
    error("PC not %2 aligned (value "+decHex(pc_getSelectedPC())+")");
  }
}
int cpu_checkRBM(){
  return 1;
}
//ALU
BusReturn alu_readDevice(unsigned int adr){
  if(adr == 0xfffb){
    return returnBasic(alu_inputA);
  } else if(adr == 0xfffc){
    return returnBasic(alu_inputB);
  } else if(adr == 0xfffa){
    return returnBasic(alu_config);
  } else if(adr == 0xfffd){
    return returnBasic(alu_calculate());
  }
  return default_return;
}
BusReturn alu_writeDevice(unsigned int adr, unsigned int data){
  if(adr == 0xfffb){
    alu_inputA = data;
  } else if(adr == 0xfffc){
    alu_inputB = data;
  } else if(adr == 0xfffa){
    alu_config = data;
  } else if(adr == 0xfffd){
    error("Attempt to write to ALU output");
  }
  return default_return;
}
unsigned int alu_calculate(){
  if(alu_config == 0){
    return alu_inputA + alu_inputB;
  } else if(alu_config == 2){
    return (alu_inputA == alu_inputB)?1:0;
  } else if(alu_config == 32){
    unsigned int r = alu_inputA - alu_inputB;
    if(r < 0){
      error(
        "Subtraction between "
        +numToString(alu_inputA)
        +" and "+numToString(alu_inputB)
        +" yeilded negative result"
      );
    }
    return r;
  } else if(alu_config == 1){
    return (alu_inputA > alu_inputB)?1:0;
  } else if(alu_config == 3){
    return (alu_inputA < alu_inputB)?1:0;
  } else if(alu_config == 4){
    return alu_inputA & alu_inputB;//TEMP
  } else if(alu_config == 5){
    return ~alu_inputA;//TEMP
  } else if(alu_config == 6){
    return alu_inputA | alu_inputB;//TEMP
  } else {
    error("Undefined ALU config: "+decHex(alu_config));
  }
  return 0;
}
//LCD
BusReturn lcd_readDevice(unsigned int adr){
  if(adr == 0xfff9) return returnBasic(lcd_status);
  return default_return;
}
BusReturn lcd_writeDevice(unsigned int adr, unsigned int data){
  if(adr == 0xfff9){
    lcd_status = data;
    refreshDisplay();
  }
  return default_return;
}
void lcd_refreshDisplay(){
  string status;
  if(lcd_status == 0x0){
    status = "Uninitialized";
  } else if(lcd_status == 0x1){
    status = "Working";
  } else if(lcd_status == 0x2){
    status = "Idle";
  } else if(lcd_status == 0x3){
    status = "Loading Program";
  } else if(lcd_status == 0x4){
    status = "Loading Data";
  } else if(lcd_status == 0x5){
    status = "Halted";
  } else if(lcd_status == 0xffff){
    status = "Induced Crash";
  } else if(lcd_status == 0xfffe){
    status = "EvalPath - Not Directory Error";
  } else if(lcd_status == 0xfffd){
    status = "EvalPath - Not Found Error";
  } else if(lcd_status == 0xfffc){
    status = "KernelFunction - Not Found Error";
  } else {
    status = decHex(lcd_status);
  }
  log(
    "-----\nStatus: "
    +decHex(lcd_status)
    +" ("+status+")"
  );
}
//Bus Firewall
bool busFirewall_checkActive(){
  if(pc_selectedPC=="main"){
    return busFirewall_activeInterrupt;
  } else {
    return busFirewall_active;
  }
}
void busFirewall_setActive(bool value){
  if(pc_selectedPC=="main"){
    busFirewall_activeInterrupt = value;
  } else {
    busFirewall_active = value;
  }
}
BusReturn busFirewall_readDevice(unsigned int adr){
  //firewalling
  if(busFirewall_checkActive() == true && adr != 0xffff){
    if(adr < busFirewall_pageLength){
       //allow reads to memory page
      BusReturn ret = {
        false,
        adr+busFirewall_pageSource
      };
      return ret;
    } else {
      //outside of page and not pc, error
      BusReturn ret = {true};
    }
  }
  //registers
  if(adr == 0xfff1){
    return returnBasic(busFirewall_pageLength);
  } else if(adr == 0xfff0){
    return returnBasic(busFirewall_pageSource);
  }
  return default_return;
}
BusReturn busFirewall_writeDevice(unsigned int adr, unsigned int data){
  //firewalling
  if(busFirewall_checkActive() == true && adr != 0xffff){
    if(adr < busFirewall_pageLength){
      //allow writes to memory page
      BusReturn ret = {
        false,
        adr+busFirewall_pageSource
      };
      return ret;
    } else {
      //outside of page and not pc, error
      BusReturn ret = {true};
      return ret;
    }
  }
  //activation status
  if(adr == 0xffff && data == 0){
    busFirewall_setActive(!busFirewall_checkActive());
  }
  //registers
  if(adr == 0xfff1){
    busFirewall_pageLength = data;
  } else if(adr == 0xfff0){
    busFirewall_pageSource = data;
  }
  return default_return;
}
//PC
unsigned int pc_getSelectedPC(){
  if(pc_selectedPC == "main"){
    return pc_mainPC;
  } else if(pc_selectedPC == "interrupt"){
    return pc_interruptPC;
  }
  return 0;
}
void pc_incPC(){
  if(pc_selectedPC == "main"){
    pc_mainPC++;
  } else if(pc_selectedPC == "interrupt"){
    pc_interruptPC++;
  }
}
void pc_setPC(bool interrupt){
  pc_selectedPC = (interrupt
    && pc_interruptStart != 0)
    ?"interrupt":"main";
  if(pc_selectedPC == "main"){
    pc_interruptPC = pc_interruptStart;
  }
}
BusReturn pc_readDevice(unsigned int adr){
  //primary access
  if(adr == 0xffff){
    if(pc_selectedPC == "main"){
      return returnBasic(pc_mainPC);
    } else if(pc_selectedPC == "interrupt"){
      return returnBasic(pc_interruptPC);
    }
  }
  //secondary access
  if(adr == 0xfffe){
    if(pc_selectedPC == "interrupt"){
      return returnBasic(pc_mainPC);
    } else if(pc_selectedPC == "main"){
      return returnBasic(pc_interruptPC);
    }
  }
  return default_return;
}
BusReturn pc_writeDevice(unsigned int adr, unsigned int data){
  //primary access
  if(adr == 0xffff){
    if(pc_selectedPC == "main"){
      pc_mainPC = data;
    } else if(pc_selectedPC == "interrupt"){
      pc_interruptPC = data;
    }
  }
  //secondary access
  if(adr == 0xfffe){
    if(pc_selectedPC == "interrupt"){
      pc_mainPC = data;
    } else if(pc_selectedPC == "main"){
      pc_interruptStart = data;
      pc_interruptPC = data;
    }
  }
  return default_return;
}
//Memory
unsigned int memory_read(unsigned int adr){
  if(memory_romEnabled == true){
    return memory_rom[adr];
  } else {
    return memory_ram[adr];
  }
}
void memory_write(unsigned int adr, unsigned int data){
  if(memory_romEnabled == true){
    error("Attempt to write to ROM adr "+decHex(adr));
  } else {
    memory_ram[adr] = data;
  }
}
BusReturn memory_readDevice(unsigned int adr){
  if(adr<0xf000){
    return returnBasic(memory_read(adr));
  }
  return default_return;
}
BusReturn memory_writeDevice(unsigned int adr, unsigned int data){
  if(adr<0xf000){
    memory_write(adr,data);
  }
  return default_return;
}
//TTY
BusReturn tty_readDevice(unsigned int adr){
  if(adr == 0xfff8){
    error("Attempt to read TTY input");
  }
  return default_return;
}
BusReturn tty_writeDevice(unsigned int adr, unsigned int data){
  if(adr == 0xfff8){
    string ascii[] = {
      " ","!","\"","#","$","%","&","'","(",")","*","+",",","-",".","/",
      "0","1","2","3","4","5","6","7","8","9",":",";","<","=",">","?",
      "@","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O",
      "P","Q","R","S","T","U","V","W","X","Y","Z","[","\\","]","^","_",
      "`","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o",
      "p","q","r","s","t","u","v","w","x","y","z","{","|","}","~"
    };
    //get character to add
    string c;
    if(data - 32 < 95){
      c = ascii[data - 32];
    } else if(data == 10){
      c = "";
      tty_scroll();
    } else {
      c = "<"+decHex(data)+">";
    }
    //check for overflow
    if(tty_lines[0].length() == tty_columns){
      tty_scroll();
    }
    //add character
    tty_lines[0] += c;
    //update display
    refreshDisplay();
  }
  return default_return;
}
void tty_scroll(){
  //move lines
  for(int i=15;i>0;i--){
    tty_lines[i] = tty_lines[i-1];
  }
  //add new line
  tty_lines[0] = "";
}
void tty_refreshDisplay(){
  for(int i=15;i>=0;i--){
    log(tty_lines[i]);
  }
}
//Keyboard
BusReturn keyboard_readDevice(unsigned int adr){
  if(adr == 0xfff7){
    string ascii[] = {
      " ","!","\"","#","$","%","&","'","(",")","*","+",",","-",".","/",
      "0","1","2","3","4","5","6","7","8","9",":",";","<","=",">","?",
      "@","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O",
      "P","Q","R","S","T","U","V","W","X","Y","Z","[","\\","]","^","_",
      "`","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o",
      "p","q","r","s","t","u","v","w","x","y","z","{","|","}","~"
    };
    unsigned int r = 0xeeee;
    string c = "-";
    c[0] = keyboard_buffer[0];
    for(unsigned int i=0;i<96;i++){
      if(ascii[i] == c){
        r = i + 32;
        break;
      }
    }
    if(c == "\n"){
      r = 10;
    }
    return returnBasic(r);
  }
  return default_return;
}
BusReturn keyboard_writeDevice(unsigned int adr, unsigned int data){
  if(adr == 0xfff7){
    string newBuffer = "";
    for(int i=1;i<keyboard_buffer.length();i++){
      newBuffer += keyboard_buffer[i];
    }
    keyboard_buffer = newBuffer;
  }
  return default_return;
}
bool keyboard_interruptStatus(){
  return keyboard_buffer.length() != 0;
}
//Disk
BusReturn disk_readDevice(unsigned int adr){
  if(adr == 0xfff6){
    return returnBasic(disk_sourceH);
  } else if(adr == 0xfff5){
    return returnBasic(disk_sourceL);
  } else if(adr == 0xfff4){
    return returnBasic(disk_transferLen);
  } else if(adr == 0xfff3){
    return returnBasic(disk_dest);
  } else if(adr == 0xfff2){
    error("Attempt to read hard drive transfer initiation adress");
  }
  return default_return;
}
BusReturn disk_writeDevice(unsigned int adr, unsigned int data){
  if(adr == 0xfff6){
    disk_sourceH = data;
  } else if(adr == 0xfff5){
    disk_sourceL = data;
  } else if(adr == 0xfff4){
    disk_transferLen = data;
  } else if(adr == 0xfff3){
    disk_dest = data;
  } else if(adr == 0xfff2){
    disk_transferScan = 0;
    disk_inTransfer = true;
    memory_romEnabled = false;
  }
  return default_return;
}
void disk_takeCycle(){
  //get word from disk
  unsigned int word = disk_disk[
    disk_sourceH*0x1000
    +disk_sourceL
    +disk_transferScan
  ];
  //write word to bus
  busWrite(
    disk_dest+disk_transferScan,word
  );
  //next adress
  disk_transferScan++;
  //check for end
  if(disk_transferScan >= disk_transferLen){
    disk_inTransfer = false;
  }
}
int disk_checkRBM(){
  if(disk_inTransfer == true){
    return 2;
  }
  return 0;
}

//Bus manipulation
unsigned int busRead(unsigned int adr){
  //history stub
  string hStart = ((pc_selectedPC=="main")?" ":"*");
  historyAdd(
    hStart+"Read from "+decHex(adr)+"..."
  );
  //perform read
  BusReturn ret;
  bool responseGiven = false;
  for(int i=0;i<9;i++){
    //get response
    BusReturn posRet = bus[i].readDevice(adr);
    //check for end
    if(posRet.end == true){
      break;
    }
    //check for override
    if(posRet.adrOverride != 0){
      adr = posRet.adrOverride;
    }
    //check for value
    if(posRet.valReturned == true){
      //check for multiple returns
      if(responseGiven == true){
        error(
          "Multiple returns for bus read at adress "
          +decHex(adr)
        );
      }
      //set response as final
      responseGiven = true;
      ret = posRet;
    }
  }
  //check for no returns
  if(responseGiven == false){
    error(
      "No returns for bus read at adress "
      +decHex(adr)
    );
  }
  //finish history
  historyEdit(
    hStart+
    "Read from "+decHex(adr)+", value "
    +decHex(ret.value)
  );
  //return
  return ret.value;
}

void busWrite(unsigned int adr, unsigned int data){
  //history stub
  string hStart = ((pc_selectedPC=="main")?" ":"*");
  historyAdd(
    hStart+
    "Write to "+decHex(adr)+", value "
    +decHex(data)+"..."
  );
  //perform write
  for(int i=0;i<9;i++){
    BusReturn r = bus[i].writeDevice(adr,data);
    if(r.end == true){
      break;
    } else if(r.adrOverride != 0){
      adr = r.adrOverride;
    }
  }
  //finish history
  historyEdit(
    hStart+
    "Write to "+decHex(adr)+", value "
    +decHex(data)
  );
}

bool getBusInterruptStatus(){
  for(int i=0;i<9;i++){
    if(bus[i].interruptStatus() == true){
      return true;
    }
  }
  return false;
}

//Simulation management
void simulateCycle(){
  //determine bus master
  BusDevice cycleMaster;
  cycleMaster.takeCycle = &noBusMaster;
  int maxRBM = 0;
  for(int i=0;i<9;i++){
    int rbm = bus[i].checkRBM();
    if(rbm > maxRBM){
      cycleMaster = bus[i];
      maxRBM = rbm;
    }
  }
  //tick device
  cycleMaster.takeCycle();
}

void error(string e,int historyLen){
  log("-----");
  log("Emulation error:");
  log(e);
  log("");
  unsigned int instr = (pc_getSelectedPC()/2)*2;
  unsigned int instrR = instr;
  if(
    busFirewall_checkActive() == true &&
    instr < busFirewall_pageLength
  ){
    instr += busFirewall_pageSource;
    log("Bus Firewall:");
    log("Source: "+decHex(busFirewall_pageSource));
    log("Length: "+decHex(busFirewall_pageLength));
    log("");
  }
  log("Instruction:");
  log(
    decHex(memory_read(instr))+" "
    +decHex(memory_read(instr+1)));
  log("At adress "+decHex(instrR));
  log("");
  log("Bus history (newest first):");
  for(int i=0;i<historyLen;i++){
    log(busHistory[i]);
  }
  log("");
  string memEn = memory_romEnabled?"ROM":"RAM";
  log("Memory dump ("+memEn+"):");
  string memS = "";
  int addLine = 8;
  int adr = 0;
  int max = memory_romEnabled?256:1024;
  log(" adr| 0/8  1/9  2/a  3/b  4/c  5/d  6/e  7/f");
  cout << "----+---------------------------------------";
  for(int i=0;i<max;i++){
    if(addLine == 8){
      addLine = 0;
      string s = decHex(adr);
      while(s.length() < 4) s = " "+s;
      cout << "\n"+s+"|";
      adr += 8;
    } else {
      cout << " ";
    }
    string s = decHex(memory_read(i));
    while(s.length() < 4) s = " "+s;
    cout << s;
    addLine++;
  }
  log("");
  log("Comitting null.f");
  throw new string("");
}
void error(string e){
  error(e,10);
}

void historyAdd(string m){
  //shift history
  busHistory[49] = "";
  for(int i=49;i>0;i--){
    busHistory[i] = busHistory[i-1];
  }
  //add
  busHistory[0] = m;
}
void historyEdit(string m){
  busHistory[0] = m;
}

void noBusMaster(){
  error("No bus master");
}

void refreshDisplay(){
  //clear
  system("clear");
  //tty
  tty_refreshDisplay();
  //lcd
  lcd_refreshDisplay();
}

//Utilites
void log(string m){
  cout << m << endl;
}
void log(unsigned int m){
  cout << m << endl;
}

string decHex(unsigned int v){
  string o = "";
  char d[] = {
    '0','1','2','3','4','5','6','7',
    '8','9','a','b','c','d','e','f'
  };
  do {
    o = d[v%16]+o;
    v = v/16;
  } while (v > 0);
  return o;
}
unsigned int hexDec(string s){
  char d[] = {
    '0','1','2','3','4','5','6','7',
    '8','9','a','b','c','d','e','f'
  };
  unsigned int result = 0;
  for(int i=0;i<s.length();i++){
    result *= 16;
    int f = 0;
    for(int j=0;j<16;j++){
      if(s[i] == d[j]) result += j;
    }
  }
  return result;
}

string numToString(unsigned int n){
  ostringstream converter;
  converter << n;
  return converter.str();
}


int main(int argc, char *argv[]){

  if(argc == 1) error("No image specified");

  log(argv[1]);

  log("Loading files...");
  ostringstream romPath;
  romPath << argv[1];
  romPath << "/bootRom";
  ostringstream diskPath;
  diskPath << argv[1];
  diskPath << "/disk";
  ifstream romFile (romPath.str());
  unsigned int writeTo = 0;
  string data;
  romFile >> data;
  romFile >> data;
  while(true){
    romFile >> data;
    if(romFile.eof() == true) break;
    memory_rom[writeTo] = hexDec(data);
    writeTo++;
  }
  romFile.close();
  ifstream diskFile (diskPath.str());
  writeTo = 0;
  diskFile >> data;
  diskFile >> data;
  while(true){
    diskFile >> data;
    if(diskFile.eof() == true) break;
    disk_disk[writeTo] = hexDec(data);
    writeTo++;
  }
  diskFile.close();
  log("Files loaded");

  log("Creating bus...");
  //0: CPU
  bus[0].readDevice = &default_readDevice;
  bus[0].writeDevice = &default_writeDevice;
  bus[0].interruptStatus = &default_interruptStatus;
  bus[0].checkRBM = &cpu_checkRBM;
  bus[0].takeCycle = &cpu_takeCycle;
  //1: ALU
  bus[1].readDevice = &alu_readDevice;
  bus[1].writeDevice = &alu_writeDevice;
  bus[1].interruptStatus = &default_interruptStatus;
  bus[1].checkRBM = &default_checkRBM;
  //2: LCD
  bus[2].readDevice = &lcd_readDevice;
  bus[2].writeDevice = &lcd_writeDevice;
  bus[2].interruptStatus = &default_interruptStatus;
  bus[2].checkRBM = &default_checkRBM;
  //3: Bus Firewall
  bus[3].readDevice = &busFirewall_readDevice;
  bus[3].writeDevice = &busFirewall_writeDevice;
  bus[3].interruptStatus = &default_interruptStatus;
  bus[3].checkRBM = &default_checkRBM;
  //4: PC
  bus[4].readDevice = &pc_readDevice;
  bus[4].writeDevice = &pc_writeDevice;
  bus[4].interruptStatus = &default_interruptStatus;
  bus[4].checkRBM = &default_checkRBM;
  //5: Memory
  bus[5].readDevice = &memory_readDevice;
  bus[5].writeDevice = &memory_writeDevice;
  bus[5].interruptStatus = &default_interruptStatus;
  bus[5].checkRBM = &default_checkRBM;
  //6: TTY
  bus[6].readDevice = &tty_readDevice;
  bus[6].writeDevice = &tty_writeDevice;
  bus[6].interruptStatus = &default_interruptStatus;
  bus[6].checkRBM = &default_checkRBM;
  //7: Keyboard
  bus[7].readDevice = &keyboard_readDevice;
  bus[7].writeDevice = &keyboard_writeDevice;
  bus[7].interruptStatus = &keyboard_interruptStatus;
  bus[7].checkRBM = &default_checkRBM;
  //8: Disk
  bus[8].readDevice = &disk_readDevice;
  bus[8].writeDevice = &disk_writeDevice;
  bus[8].interruptStatus = &default_interruptStatus;
  bus[8].checkRBM = &disk_checkRBM;
  bus[8].takeCycle = &disk_takeCycle;
  //done
  log("Bus created");

  log("Starting emulation...");

  //setup input

  //<From https://stackoverflow.com/questions/6171132/non-blocking-console-input-c
  // create epoll instance
  int epollfd = epoll_create1(0);
  if (epollfd < 0) {
    cout << "epoll_create1(0) failed!" << endl;
    return -1;
  }

  // associate stdin with epoll
  EpollEvent_t ev;
  ev.data.ptr = nullptr;
  ev.data.fd = STDIN_FILENO; // from unistd.h
  ev.data.u32 = UINT32_C(0);
  ev.data.u64 = UINT64_C(0);
  ev.events = EPOLLIN;
  if (epoll_ctl(epollfd, EPOLL_CTL_ADD, STDIN_FILENO, &ev) < 0) {
    cout
      << "epoll_ctl(epollfd, EPOLL_CTL_ADD, fdin, &ev) failed."
      << endl;
    return -1;
  }
  //>

  //emulation loop
  array<EpollEvent_t,1> events;
  while(true){
    //<see above
    //input handling
    int waitret = epoll_wait(epollfd,
      events.data(),
      events.size(),
      0); // 0 is the "timeout" we want
    if (waitret < 0) {
      cout << "epoll_wait() failed." << endl;
    }
    if (0 < waitret) { // there is data on stdin!
      string line;
      getline(cin, line);
      if(line == "!!!CRASH!!!") error("Crash requested");
      keyboard_buffer += line + "\n";
    }
    //>

    //simulate a cycle
    simulateCycle();
  }

  //return
  return 0;
}
