(function() {

    var ct = document.cookie.match("terminal_color=(.+?)(;|$)"),
        TERMINAL_COLOR = ct && ct.length ? ct[1] : '17,187,17',  // green
        PADDING = 10;

    var socket = io.connect(window.location.origin),
        reconnect = false,
        feeds,
        color_picker = $('#color-picker'),
        color_cube,
        refresh = $('#refresh'),
        nav_bar = $('#nav_bar'),
        add_feed = $('#add-feed'),
        feed_container = $('#feeds'),
        tile_chooser = $('#tile-chooser'),
        data_received = $('.data_received'),
        connected = $('#connection'),
        notification = $('#notification'),
        refresh_active = false,
        cache = {},

        win_width = feed_container.width(),
        win_height = window.innerHeight - nav_bar.height(),

        resize_timer = null, //Debouncer

        tile_prefs = {
            fullscreen: 'fullscreen',
            horizontal: 'horizontal',
            vertical: 'vertical',
            four_way: 'four'
        };


    function init() {
        feeds = getHash();

        if (feeds.length) {
            // populate the page from the hash
            for (var i = 0, len = feeds.length; i < len; i++) {
                addNewFeed(feeds[i]);
            }
            updateZIndex();

            // trigger filters
            $('.feed input').keyup();
        }

        attachEvents();
        color_picker.css('background', 'rgb(' + TERMINAL_COLOR + ')');
        updateTilePreference();
    }

    function attachEvents() {
        socket.on('connect', function() {
            if (reconnect) {
                reconnect = false;
                refreshPage();
            }
            connected.attr('title', 'Connected');
            connected.addClass('on');
        });

        socket.on('disconnect', function() {
            reconnect = true;
            connected.attr('title', 'Disconnected');
            connected.removeClass('on');
        });

        socket.on('refresh', refreshPage);

        tile_chooser.on('click', '.tile', function() {
            var pref = $(this).data('pref');
            setTilePreference(pref);
        });

        $(window).on('resize', onWindowResize);

        add_feed.on('click', 'li a', onAddFeedClick);
    }

    function onAddFeedClick(e) {
        e.preventDefault();

        var channel = $(this).attr('href').substring(1),
            feed_ct, feed;

        if ($('#' + channel + '-feed').length) {
            updateZIndex(channel);
            return;
        }

        feed_ct = $('.feed').length;

        feed = {
            channel: channel,
            top: 100+(feed_ct*20),
            left: 100+(feed_ct*20)
        };

        addNewFeed(feed);

        feeds.push(feed);

        updateZIndex(feed.channel);
        updateTilePreference();
        updateHash();
    }

    function onWindowResize(e) {
        clearTimeout(resize_timer);

        if (e.target !== window) {
            unsetTilePreference();
            setMovingClass();
        }
        else if (!notification.is(':visible')) {
            notification.find('p').text('Resizing...');
            notification.slideDown();
        }

        // mitigate resizing to occur at most once per 100ms
        resize_timer = setTimeout(function() {
            unsetMovingClass();
            updateTilePreference();
            notification.slideUp();
        }, 100);

    }

    function setMovingClass() {
        document.body.classList.add('moving');
    }

    function unsetMovingClass() {
        document.body.classList.remove('moving');
    }

    function setContainerSize() {
        win_width = feed_container.width();
        win_height = window.innerHeight - nav_bar.height();
        feed_container.height(win_height);
    }

    function updateTilePreference() {
        setContainerSize();

        if (localStorage.tile_pref) {
            setTilePreference(localStorage.tile_pref);
        }
    }

    function setTilePreference(pref) {
        tile_chooser.find('.tile').removeClass('active');
        tile_chooser.find('[data-pref="' + pref + '"]').addClass('active');
        localStorage.tile_pref = pref;

        activateTilePreference(pref);
    }

    function unsetTilePreference() {
        tile_chooser.find('.tile').removeClass('active');
        localStorage.tile_pref = null;
    }

    function activateTilePreference(pref) {
        switch (pref) {
            case tile_prefs.fullscreen:
                setTilesFullscreen();
                break;
            case tile_prefs.horizontal:
                setTilesHorizontally();
                break;
            case tile_prefs.vertical:
                setTilesVertically();
                break;
            case tile_prefs.four_way:
                setTilesFourways();
                break;
        }
        updateHash();
    }

    function setTilesFullscreen() {
        $('.feed').each(function(i, tile) {
            $(tile).css({
                width: win_width,
                height: win_height - (6 * PADDING),
                left: 0,
                top: 0
            });
        });
    }

    function setTilesHorizontally() {
        $('.feed').each(function(i, tile) {
            $(tile).css({
                width: (win_width - (2 * PADDING)) / 2,
                height: (win_height - (6 * PADDING)),
                left: i % 2 === 0 ? 0 : win_width / 2,
                top: 0
            });
        });
    }

    function setTilesVertically() {
        $('.feed').each(function(i, tile) {
            $(tile).css({
                width: win_width,
                height: (win_height - (12 * PADDING)) / 2, //arbitrary 12 to account for feed headers and whatnot
                left: 0,
                top: i % 2 === 0 ? 0 : win_height / 2
            });
        });
    }

    function setTilesFourways() {
        $('.feed').each(function(i, tile) {
            var props = {
                width: (win_width - (2 * PADDING)) / 2,
                height: (win_height - (12 * PADDING)) / 2
            };

            switch (i % 4) {
                case 0:
                    props.top = 0;
                    props.left = 0;
                    break;
                case 1:
                    props.top = 0;
                    props.left = win_width / 2;
                    break;
                case 2:
                    props.top = win_height / 2;
                    props.left = 0;
                    break;
                case 3:
                    props.top = win_height / 2;
                    props.left = win_width / 2;
                    break;
            }

            $(tile).css(props);
        });
    }

    function refreshPage() {

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

    function getHash() {
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

    function setHash(d) {
        window.location.hash = JSON.stringify(d);
    }

    function updateHash() {

        for (var i = 0; i < feeds.length; i++) {
            var obj = $('#'+feeds[i].channel+'-feed');
            if (!obj.length) {
                feeds.splice(i,1);
                continue;
            }
            feeds[i].top = obj.position().top;
            feeds[i].left = obj.position().left;
            feeds[i].width = obj.width();
            feeds[i].height = obj.height();
            feeds[i].regex = obj.find('input').val();
        }

        setHash(feeds);
    }

    function updateZIndex(channel) {
        var i, len;

        for (i = 0, len = feeds.length; i < len; i++) {
            if (channel && feeds[i].channel === channel) {
                // move it to the top of the stack
                feeds.push(feeds.splice(i, 1)[0]);
            }

            $('#' + feeds[i].channel + '-feed')
                .css('z-index', i+1 * 100)
                .removeClass('active');
        }

        $('#' + feeds[i - 1].channel + '-feed').addClass('active');

    }

    function filterFeed(pre, data, channel, regex_changed) {

        pre = $(pre);
        var regex = pre.parent().find('input').data('regex'),
            matches = false;

        if (!(channel in cache)) {
            cache[channel] = [];
        }

        if (cache[channel].length > 2000) {
            cache[channel] = cache[channel].slice(Math.abs(1500-cache[channel].length));
        }

        if (data) {
            // rough approximation of a unix timestamp signature.
            // should match both with and without millis.
            data = data.replace(/\b13\d{8,11}\b/, function (d) {
                return '"'+new Date(d.substring(0,10)*1000)+'"';
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

    function addNewFeed(feed) {

        var feeddiv = $('<div class="feed" id="'+feed.channel+'-feed" />'),
            feedli = $('#add-feed li:has(a[href="#'+feed.channel+'"])');

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
            .draggable({
                handle: "nav",
                containment: feed_container,
                stop: function() {
                    updateHash();
                    unsetTilePreference();
                }
            })
            .resizable({ handles: 'se', stop: updateHash })
            .mousedown(function() { updateZIndex(feed.channel); updateHash(); })
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
                        updateHash();
                        if (hadaregex) {
                            filterFeed(feeddiv.find('pre'), null, feed.channel, true);
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

                        updateHash();
                        filterFeed(feeddiv.find('pre'), null, feed.channel, true);

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

        feed_container.append(feeddiv);
        feeddiv.fadeIn('fast');

        socket.emit('subscribe', feed.channel+':raw');
        socket.on(feed.channel+':raw', function(data) {

            data_received.addClass('on');
            setTimeout(function() { data_received.removeClass('on'); }, 800);

            var pre = feeddiv.find('pre'),
                pre_el = pre[0],
                scroll = pre_el.scrollHeight-pre_el.scrollTop === pre_el.clientHeight;

            filterFeed(pre, data, feed.channel);

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

            updateHash();

        });

        feedli.addClass('active');

    }

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

                $('pre.terminal').css('color', 'rgb(' + TERMINAL_COLOR + ')');
                color_picker.css('background', 'rgb(' + TERMINAL_COLOR + ')');

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
            .data('context', 'color-picker')
            .appendTo(document.body);

        color_cube = $(canvas);

        color_picker.find('a').on('click', function(e) {
            e.preventDefault();

            if (color_picker.hasClass('open')) {
                closeColorPicker();
            }
            else {
                openColorPicker();
                $(document).on('click', onCloseColorPicker);
            }
        });

        function onOpenColorPicker(e) {
            openColorPicker();
        }

        function onCloseColorPicker(e) { //dont close  if its color picker related
            console.log(e.target);
            if ($(e.target).data('context') === 'color-picker') {
                return;
            }
            $(document).off('click', onCloseColorPicker);
            closeColorPicker();
        }

        function openColorPicker() {
            color_picker.toggleClass('open');
            color_cube.show();
        }

        function closeColorPicker() {
            color_picker.removeClass('open');
            color_cube.hide();
        }

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

    init();
})();
