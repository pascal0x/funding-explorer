#!/bin/bash
cd ~/funding-explorer
npx serve dist -l 3000 &
sleep 2
open -a "Google Chrome" --args --app=http://localhost:3000
