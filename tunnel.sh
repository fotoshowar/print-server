#!/bin/bash
exec sshpass -p '7V[yz$}sJGFXPa_D' ssh \
  -o StrictHostKeyChecking=no \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -N -R 0.0.0.0:3001:127.0.0.1:3000 \
  root@207.148.15.8
