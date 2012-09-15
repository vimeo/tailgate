# Tailgate

Tailgate is a [nodejs](http://nodejs.org) app to pipe `tail -F` into websockets.  

It's a very simple way to have real-time access to your logs.  It uses [socket.io](http://socket.io) and [coffeescript](http://coffeescript.org), and is great for keeping track of [scribe logs](https://github.com/facebook/scribe).

Live demo here:

[![Tailgate Monitor](//github.com/vimeo/tailgate/raw/gh-pages/tailgate.png)](http://ec2-67-202-26-167.compute-1.amazonaws.com#%5B%7B%22channel%22%3A%22dev1%22%2C%22top%22%3A100%2C%22left%22%3A97%2C%22width%22%3A600%2C%22height%22%3A400%2C%22regex%22%3A%2216%3A31%3A57%22%7D%2C%7B%22channel%22%3A%22dev3%22%2C%22top%22%3A93%2C%22left%22%3A745%2C%22width%22%3A600%2C%22height%22%3A400%2C%22regex%22%3A%22%5C%5C%5B\(.%2B%3F\)%2C.%2B%3F\(0%5C%5C.%5C%5Cd%2B\)%22%7D%2C%7B%22channel%22%3A%22dev2%22%2C%22top%22%3A370%2C%22left%22%3A211%2C%22width%22%3A1058%2C%22height%22%3A422%2C%22regex%22%3A%22%22%7D%5D)

## API
Tailgate exposes its feeds as a simple pub/sub api through [socket.io](http://socket.io) connections making it easy to build visualizations or monitoring tools as simple web pages.

## Installation
	
	cd <install/directory>
	git clone git@github.com:vimeo/tailgate.git
	cd tailgate
	npm install
	cp conf/conf-dist.sh conf/conf.sh

Edit `conf/conf.sh` to have the correct values for your installation.

#### Optional
If you want to use the `init.d.sh` script.

	cp startup/init.d-dist.sh startup/init.d.sh
	sudo ln -s <fullpath to tailgate/startup/init.d.sh> /etc/init.d/tailgate

Edit the `startup/init.d.sh` script to use the installation directory and tailgate user to run as.  Ensure the tailgate user has write permissions to `startup/` so that it can write the pidfile.

	sudo /etc/init.d/tailgate start
	sudo /etc/init.d/tailgate stop
	sudo /etc/init.d/tailgate restart


## Troubleshooting
	
* Make sure the HTTP port specified in `conf/conf.sh` is not already in use
* Enable logging in `conf.sh` by setting `LOGGING="1"`