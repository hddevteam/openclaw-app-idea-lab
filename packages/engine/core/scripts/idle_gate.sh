#!/bin/bash
# Logic to check if system has been idle for >= 10 minutes
idle_ms=$(ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print $NF; exit}')
idle_sec=$((idle_ms / 1000000000))
if [ $idle_sec -ge 600 ]; then
    exit 0
else
    exit 1
fi
