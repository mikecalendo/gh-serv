#!/bin/sh

while true;  do
  n=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 13 ; echo -n '')
  mkdir -p $n
done