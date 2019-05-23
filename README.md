# minidsp-control
Control and display module for the MiniDSP 2x4 HD

Information on [the MiniDSP Forums](https://www.minidsp.com/forum/suggestion-box/14442-volume-display?limitstart=0)

Commands to install from a clean Raspbian Lite image:
```
sudo apt update && sudo apt upgrade
wget https://github.com/markubiak/node-minidsp/archive/master.zip
unzip master.zip 
rm master.zip
mv node-minidsp-master node-minidsp
cd node-minidsp/
sudo apt install nodejs
sudo apt install npm
sudo apt install build-essential libusb-1.0-0 libusb-1.0-0-dev
npm install
sudo nano /etc/udev/rules.d/99-minidsp.rules
sudo udevadm control --reload-rules
nodejs ./minidsp.js devices

```
