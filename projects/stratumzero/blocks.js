// Functional blocks of the StratumZero carrier and its Affogato compute module.
// Every part in parts.js belongs to one block; `parts` lists the parts worth naming.
export const BLOCKS = [
  {
    id: 'module',
    name: 'Compute module',
    color: '#7aa2f7',
    summary: 'The Affogato module: an ESP32-S2 for networking and an iCE40UP5K FPGA for timing, on one 20 × 45 mm board.',
    detail: 'The module plugs into the carrier on two Hirose DF40 board-to-board connectors and one M3 screw. The FPGA does every time-critical job in logic clocked by the OCXO; the ESP32-S2 runs the Rust firmware that configures the GNSS receiver, sequences power, assigns UTC to the FPGA\'s timestamps and serves the web interface, the HTTP API and NTP.',
    parts: {
      'M:U2': 'Lattice iCE40UP5K FPGA. A free-running 64-bit counter on the 10 MHz OCXO, PPS and trigger edge capture into a 512-record FIFO, the phase accumulator behind the optical time word, and a tick-scheduled trigger output. It talks to the ESP32-S2 over SPI.',
      'M:U1': 'Espressif ESP32-S2 with 4 MB of embedded flash. Wi-Fi, the web interface, the JSON/SSE API, an NTP server, over-the-air updates, the GNSS UART and power sequencing.',
      'M:Y1': '40 MHz crystal for the ESP32-S2. It only clocks the radio and CPU; timing comes from the OCXO.',
      'M:J3': 'U.FL jack for the external 2.4 GHz Wi-Fi antenna.',
      'M:U3': 'TPS62160 buck converter: the module\'s 3.3 V rail from the carrier\'s 5 V.',
      'M:U4': 'TLV75512 LDO: the FPGA\'s 1.2 V core supply.',
      'M:D1': 'RGB status LED driven by the FPGA\'s current sinks.',
      'M:J1': 'DF40 receptacle to the carrier: ESP32 signals, USB and 5 V.',
      'M:J2': 'DF40 plug to the carrier: 30 FPGA I/O, including the OCXO clock and GNSS PPS.',
      J1: 'Carrier side of the ESP32 connector (DF40 plug), under the module.',
      J2: 'Carrier side of the FPGA connector (DF40 receptacle), under the module. Pin 32 brings the 10 MHz clock in.'
    }
  },
  {
    id: 'ocxo',
    name: '10 MHz OCXO',
    color: '#e0af68',
    summary: 'An oven-controlled crystal oscillator: the board\'s short-term timebase, disciplined to GNSS by measurement.',
    detail: 'The OCXO keeps its crystal at a constant temperature, so its frequency barely moves between GNSS pulses. The FPGA counts its 10 MHz cycles (100 ns ticks) and the firmware fits that count against the pulse-per-second, which places any tick between two pulses on the UTC timeline and lets the clock coast through a short PPS gap. It has its own regulator on a copper island and a three-minute warm-up before the clock is trusted.',
    parts: {
      Y1: 'Abracon AOC97 10 MHz, 3.3 V OCXO. Hand-fitted; the 3D model is a drawing-derived envelope.',
      U15: 'TPS7A4533 1.5 A low-noise LDO, dedicated to the oscillator and switched by the ESP32 (GPIO5). The oven pulls several hundred milliamps while it heats.',
      R173: 'Series resistor on the clock line to the FPGA. It also sets the edge rate the trace radiates.'
    }
  },
  {
    id: 'gnss',
    name: 'GNSS receiver',
    color: '#9ece6a',
    summary: 'A u-blox MAX-M10S: absolute time and the pulse-per-second everything is referenced to.',
    detail: 'The receiver tracks GPS, Galileo, GLONASS and BeiDou. Its PPS edge goes straight to the FPGA (and to the ESP32 for diagnostics); its UBX messages over UART tell the firmware which UTC second that edge belongs to and how good it is. It also timestamps every trigger-input edge on its EXTINT pin against GNSS time, an independent check on the FPGA\'s own capture. A rechargeable backup cell keeps the almanac and clock alive between power-ups, so restarts are hot.',
    parts: {
      U6: 'u-blox MAX-M10S multi-constellation GNSS module. PPS to the FPGA, UART to the ESP32, EXTINT from the trigger input.',
      J5: 'Edge-launch SMA for an active GNSS antenna, fed by a 50 Ω grounded coplanar line with a via fence.',
      U5: 'AP2112K 3.3 V regulator for the receiver, switched by the ESP32 so it can be power-cycled.',
      BT1: 'Clip for a user-fitted ML1220 rechargeable lithium cell: about three weeks of backup power.',
      D75: 'BAS16 diode in the trickle-charge path: floats the cell near 3.0 V and stops it back-feeding the rail.',
      D74: 'PPS indicator LED, blinking once per second with the receiver\'s pulse.'
    }
  },
  {
    id: 'display',
    name: 'Optical time word',
    color: '#73daca',
    summary: '64 green LEDs: the fraction of the current UTC second as a 16-bit binary word, repeated in four rows.',
    detail: 'Bit 15 is on the left. The least significant bit flips every 1/65536 s (15.26 µs), so a camera exposure that sees the array has the UTC time of its own capture written into the picture, and a rolling-shutter sensor sees the word change part-way down the frame. The four rows are identical, not multiplexed. Each LED has its own 470 Ω resistor, a 47 pF speed-up capacitor and a 100 nF bypass, laid out identically so every LED switches the same way.',
    parts: {
      U3: 'SN74LVC541 octal buffer: eight FPGA bits to the column switches, with a shared output-enable that blanks the array.',
      U4: 'SN74LVC541 octal buffer for the other eight bits.',
      Q1: 'AO3400A MOSFET column switch, bit 15 (one per bit, Q1 to Q16).',
      D10: 'Row 0, bit 15. All 64 LEDs are YLED1206G green 1206 parts.'
    }
  },
  {
    id: 'brightness',
    name: 'LED brightness',
    color: '#bb9af7',
    summary: 'A DAC-steered regulator sets the display\'s supply, from about 2.9 V to 4.7 V.',
    detail: 'The LED anodes run from their own rail. The ESP32 writes a 12-bit DAC that pulls on the regulator\'s adjust node, so brightness can be matched to the camera\'s exposure without touching the timing. A solder jumper bypasses it all for fixed full brightness.',
    parts: {
      U17: 'TPS7A4501 adjustable LDO generating LED_VDD from the switched 5 V.',
      U18: 'MCP4725 12-bit I²C DAC on the OLED bus; code 0 is brightest.',
      SJ1: 'Solder jumper: bridge it to tie LED_VDD straight to 5 V.'
    }
  },
  {
    id: 'trigger',
    name: 'Trigger I/O',
    color: '#ff9e64',
    summary: 'An SMA input that timestamps external edges, and an SMA output that fires at scheduled ticks.',
    detail: 'The input accepts 0 to 5 V logic: an RC filter, a fast comparator at half the supply, then a 3.3 V Schmitt buffer that feeds the FPGA, the ESP32 and the receiver\'s EXTINT, so one edge is timestamped three independent ways. The output is scheduled by the FPGA to an exact tick and driven as 5 V logic into a high-impedance load.',
    parts: {
      J6: 'Trigger input SMA.',
      U9: 'TLV3501 4.5 ns comparator with its threshold at 2.5 V.',
      U7: 'SN74LVC1G17 Schmitt buffer: a clean 3.3 V edge to the FPGA, ESP32 and GNSS.',
      J7: 'Trigger output SMA.',
      U10: 'SN74AHCT1G125 driver: the FPGA\'s scheduled pulse as 5 V logic.'
    }
  },
  {
    id: 'power',
    name: 'USB-C power',
    color: '#f7768e',
    summary: 'USB-C negotiates 5 V / 3 A, and an eFuse gates and measures everything except the module.',
    detail: 'The PD controller only ever requests 5 V: the module and the input dividers sit on VBUS directly. The ESP32 reads the negotiated contract over I²C before it turns on the switched 5 V domain, then brings the GNSS, OCXO and display rails up one at a time while it watches the eFuse\'s current monitor. Native USB data runs through to the ESP32-S2.',
    parts: {
      J3: 'USB-C receptacle: power and full-speed USB data.',
      U11: 'HUSB238 USB PD sink controller, fixed to a 5 V / 3 A request.',
      U14: 'TPS259531 eFuse: the switched 5 V domain, a 2.48 A limit, a 12 ms soft start and a current mirror to the ESP32\'s ADC.',
      U1: 'USBLC6-2 ESD protection on the USB data pair.',
      D1: 'Power indicator.'
    }
  },
  {
    id: 'logic',
    name: 'Status display',
    color: '#7dcfff',
    summary: 'A 0.96-inch OLED for people: the time in big digits, lock state, satellites, power and the IP address.',
    detail: 'The OLED is for the human, not the camera. The firmware redraws it once per second, timed so the digits change on the UTC second, and rotates the status lines underneath. Its 3.3 V logic rail also feeds the LED buffers and the brightness DAC.',
    parts: {
      DS1: 'HS96L03W2C03 128 × 64 SSD1315 OLED on 3 mm standoffs. Hand-fitted.',
      J8: 'Four-pin header to the OLED: GND, 3.3 V, SCL, SDA.',
      U2: 'AP2112K 3.3 V regulator for the local logic rail.'
    }
  }
];
