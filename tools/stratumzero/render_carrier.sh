#!/bin/bash
cd /tmp/szweb/board
R="kicad-cli pcb render --quality high --background transparent"
$R -o /tmp/szweb/r/top_hi.png -w 7200 -h 4000 --side top calibrator.kicad_pcb
$R -o /tmp/szweb/r/bottom.png -w 3600 -h 2000 --side bottom calibrator.kicad_pcb
$R -o /tmp/szweb/r/hero.png -w 4000 -h 2250 --perspective --rotate '-52,0,-28' --zoom 1.05 calibrator.kicad_pcb
$R -o /tmp/szweb/r/angle_left.png -w 3200 -h 1800 --perspective --rotate '-58,0,32' --zoom 1.05 calibrator.kicad_pcb
$R -o /tmp/szweb/r/edge_right.png -w 3200 -h 1800 --perspective --rotate '-68,0,-75' --zoom 1.2 calibrator.kicad_pcb
$R -o /tmp/szweb/r/low_leds.png -w 3200 -h 1800 --perspective --rotate '-74,0,8' --zoom 1.3 calibrator.kicad_pcb
echo DONE
