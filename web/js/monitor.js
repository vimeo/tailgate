(function() {

	var ct = document.cookie.match("terminal_color=(.+?)(;|$)"),
		TERMINAL_COLOR = ct && ct.length ? ct[1] : '17,187,17';  // green

	var socket = io.connect(window.location.origin),
		reconnect = false,
		feeds = get_hash(),
		refresh = $('#refresh'),
		data_received = $('#status_symbols .data_received'),
		connected = $('#status_symbols .connected'),
		refresh_active = false;

	socket.on('connect', function() {
		if (reconnect) {
			reconnect = false;
			refresh_page();
		}
		connected.text('Yes');
	});
	socket.on('disconnect', function() {
		reconnect = true;
		connected.text('No');
	});

	socket.on('refresh', refresh_page);

	function refresh_page() {

		if (refresh_active)
			return;

		refresh_active = true;

		var timeout, t = parseInt(refresh.find('.t').text(), 10);

		refresh.find('.close').click(function(e){
			e.preventDefault();
			clearTimeout(timeout);
			refresh.fadeOut(function(){
				refresh_active = false;
				refresh.find('.t').text(10);
			});
		});

		refresh.fadeIn(function(){
			(function(){
				while (t-- > 0) {
					refresh.find('.t').text(t);
					timeout = setTimeout(arguments.callee,1e3);
					return;
				}
				$('.feed').add(refresh).fadeOut(function(){
					window.location.reload(true);
				});
			})();
		});

	}

	function get_hash() {
		try {
			var hash = window.location.hash.substring(1);
			if (hash[0] === '%')
				hash = unescape(hash);
			return JSON.parse(hash);
		}
		catch (e) {
			return [];
		}
	}

	function set_hash(d) {
		window.location.hash = JSON.stringify(d);
	}

	function update_hash() {
		
		for (var i = 0; i < feeds.length; i++) {
			var obj = $('#'+feeds[i].channel+'-feed');
			if (!obj.length) {
				feeds.splice(i,1);
				continue;
			}
			feeds[i].top = obj.offset().top;
			feeds[i].left = obj.offset().left;
			feeds[i].width = obj.width();
			feeds[i].height = obj.height();
			feeds[i].regex = obj.find('input').val();
		}

		set_hash(feeds);
	}

	function update_zindexes(channel) {

		var i;
		if (channel) {
			for (i = 0; i < feeds.length; i++) {
				if (feeds[i].channel == channel) {
					// move it to the top of the stack
					feeds.push(feeds.splice(i,1)[0]);
				}
			}
		}

		for (i = 0; i < feeds.length; i++) {
			$("#"+feeds[i].channel+'-feed')
				.css('z-index', i*100)
				.removeClass('active');
		}

		$("#"+feeds[i-1].channel+'-feed').addClass('active');

	}

	function filter_feed(pre, data, channel, regex_changed) {

		pre = $(pre);
		var regex = pre.parent().find('input').data('regex'),
			matches = false,
			cache = filter_feed.cache;

		if (!(channel in cache)) {
			cache[channel] = [];
		}

		if (cache[channel].length > 2000) {
			cache[channel] = cache[channel].slice(Math.abs(1500-cache[channel].length));
		}

		if (data) {
			// rough approximation of a unix timestamp signature.
			// should match both with and without millis.
			data = data.replace(/\b13\d{8,11}\b/g, function (d) {
				return new Date(d.substring(0,10)*1000);
			}).split(/\s*\n+/).filter(function(l) {return l;});
			cache[channel] = cache[channel].concat(data);
		}

		if (regex) {
			var ret = [];
			for (var i = 0, len = cache[channel].length; i < len; i++) {
				var m = cache[channel][i].match(regex); // match custom regex
				if (m) {
					ret.push(m.length > 1 && m.slice(1).join(', ') || cache[channel][i]);
				}
			}

			pre.text(ret.join("\n")+"\n");

			if (regex_changed) {
				pre.scrollTop(99999);
			}
		}
		else {
			pre.text(cache[channel].join("\n")+"\n");
		}

	}
	filter_feed.cache = {};

	function add_new_feed(feed) {

		var feeddiv = $('<div class="feed" id="'+feed.channel+'-feed" />'),
			feedli = $('#add-feed li:has(a[href=#'+feed.channel+'])');

		feeddiv.css({
			top: feed.top,
			left: feed.left,
			width: feed.width,
			height: feed.height
		});
		feeddiv
			.append('<nav>'+feed.channel+'<a href="#" class="close">&times;</a><input placeholder="/.*/" /><button class="pause-button btn-mini btn-inverse">pause</button></nav>')
			.append($('<pre class="terminal" contenteditable="true" />').css('color', 'rgb('+TERMINAL_COLOR+')'));

		if (feed.regex) {
			feeddiv.find('input').val(feed.regex);
		}

		feeddiv
			.hide()
			.draggable({ handle: "nav", containment: "document", stop: update_hash })
			.resizable({ handles: 'se', stop: update_hash })
			.click(function() { update_zindexes(feed.channel); update_hash(); })
			.css('position','absolute')
			.find('nav button.pause-button').click(function(e) {
				feeddiv.toggleClass('paused');
				if (feeddiv.hasClass('paused')) {
					socket.emit('unsubscribe', feed.channel+':raw');
					e.target.innerText =  'resume';
				}
				else {
					socket.emit('subscribe', feed.channel+':raw');
					e.target.innerText =  'pause';
				}
			}).end()
			.find('nav input')
				.keydown(function(e) { e.stopImmediatePropagation(); })
				.keyup(function(e) {

					if (e.target.value.length === 0) {
						var hadaregex = !! $(this).data('regex');
						$(this).data('regex',null);
						update_hash();
						if (hadaregex) {
							filter_feed(feeddiv.find('pre'), null, feed.channel, true);
						}
						return;
					}

					// test the regex
					try {
						var value = e.target.value,
							regex,
							regex_string = value.replace(/^\//,'').replace(/\/[a-z]*$/,''),
							mods = value.match(/\/([a-z]+)$/);

						if (mods && mods.length) {
							regex = new RegExp(regex_string, mods[1]);
						}
						else {
							regex = new RegExp(regex_string);
						}

						// it passes, save it
						$(this).data('regex',regex).removeClass('error');

						update_hash();
						filter_feed(feeddiv.find('pre'), null, feed.channel, true);

					} catch (e) {
						console.error(e);
						$(this).addClass('error');
					}

			}).end()
			.find('pre')
				.data('autoscroll', true)
				.scroll(function(e) {
					$(this).data('autoscroll', e.target.scrollHeight-e.target.scrollTop === e.target.clientHeight);
				});

		$(document.body).append(feeddiv);
		feeddiv.fadeIn();

		socket.emit('subscribe', feed.channel+':raw');
		socket.on(feed.channel+':raw', function(data) {

			data_received.text('๏๏๏');
			setTimeout(function() { data_received.text('');	}, 800);

			var pre = feeddiv.find('pre'),
				pre_el = pre[0],
				scroll = pre_el.scrollHeight-pre_el.scrollTop === pre_el.clientHeight;

			filter_feed(pre, data, feed.channel);

			if (scroll) {
				// auto scroll to the bottom unless user intervention
				pre.scrollTop(99999);
			}

		});

		feeddiv.find('a.close').click(function(e) {

			e.preventDefault();

			feedli.removeClass('active');

			socket.emit("unsubscribe", feed.channel+":raw");
			socket.removeListener(feed.channel+":raw", function(data) { feeddiv.find('pre').append(data); });
			feeddiv.remove();

			update_hash();

		});

		feedli.addClass('active');

	}

	if (feeds.length) {
		// populate the page from the hash
		for (var i = 0; i < feeds.length; i++) {
			add_new_feed(feeds[i]);
		}
		update_zindexes();

		// trigger filters
		$('.feed input').keyup();
	}

	$('#add-feed li a').click(function(e) {

		e.preventDefault();

		var channel = $(this).attr('href').substring(1);

		if ($("#"+channel+"-feed").length) {
			update_zindexes(channel);
			return;
		}

		var feed_ct = $('.feed').length;

		var feed = {
			channel: channel,
			top: 100+(feed_ct*20),
			left: 100+(feed_ct*20)
		};

		add_new_feed(feed);
		
		feeds.push(feed);

		update_zindexes(feed.channel);

		update_hash();

	});

	(function() {

		var down = false,
			canvas = document.createElement('canvas'),
			ctx = canvas.getContext('2d'),
			img = new Image();

		canvas.id = 'color-cube';
		canvas.width = canvas.height = 200;

		img.src = '/img/color_cube.png';
		img.onload = function() {
			ctx.drawImage(img, 0,0);
		};

		function update_color(x,y, save) {

			var d = ctx.getImageData(x,y,1,1);

			if (d instanceof ImageData) {
				TERMINAL_COLOR = [].slice.call(d.data,0,3).toString();

				$('pre.terminal').css('color', 'rgb('+TERMINAL_COLOR+')');

				if (save) {
					var expire = Date.now()+(60*60*24*365); // a year
					document.cookie = "terminal_color="+TERMINAL_COLOR+";max-age="+expire+";";
				}
			}
		}

		$(canvas)
			.on('selectstart', function(e) { e.preventDefault(); }) // prevent cursor change on drag
			.mousedown(function(e) { down = true; })
			.mousemove(function(e) { if (down) update_color(e.offsetX, e.offsetY); })
			.mouseup(function(e) { down = false; update_color(e.offsetX, e.offsetY, true); })
			.mouseout(function(e) { down = false; })
			.appendTo(document.body);

		$('#color-picker a').click(function(e) {
			e.preventDefault();
			$('#color-picker').toggleClass('open');
			$('#color-cube').toggle();
		});

	})();

	// extending functionality of the feed list
	(function() {

		var btn_group = $('#add-feed'),
			btn = btn_group.find('button'),
			menu = btn_group.find('.dropdown-menu'),
			input = menu.find('input'),
			lis = menu.find('li');

		$(document).keydown(function(e) {

			if (btn_group.hasClass('open')) {

				menu.find('li:hidden').removeClass('selected');

				var selected = menu.find('li.selected');

				switch (e.which) {
					case 38: // up
						var prev = selected.prevAll('li:visible').first();
						if (selected.length === 0) {
							menu.find('li:visible').first().addClass('selected');
						}
						else if (prev.length) {
							prev.addClass('selected');
							selected.removeClass('selected');
						}
						break;
					case 40: // down
						var next = selected.nextAll('li:visible').first();
						if (selected.length === 0) {
							menu.find('li:visible').first().addClass('selected');
						}
						else if (next.length) {
							next.addClass('selected');
							selected.removeClass('selected');
						}
						break;
					case 13: // enter
						selected.removeClass('selected')
							.find('a').click();
						input.val('').keyup();
						break;
					case 27: // escape
						lis.removeClass('selected');
						btn.click();
						input.val('').keyup();
						break;
				}
			}
			// open on t
			else if (e.which === 84) {
				btn.click();
				input.focus();
				e.preventDefault();
			}
		});

		input
			.click(function(e){
				e.preventDefault();
				e.stopImmediatePropagation();
			})
			.keyup(function(e){
				lis.show()
					.filter(function(i, el){
						return $(el).text().toLowerCase().indexOf(e.target.value.toLowerCase()) === -1;
					}).hide();
			});

	})();

})();
