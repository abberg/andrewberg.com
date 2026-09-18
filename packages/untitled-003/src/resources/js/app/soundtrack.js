// The public widget needs no API key and never blocks scene startup.
var vignetteSoundtrack = (function(){
    var widget, ready = false, requested = false, delayComplete = false, started = false;
    var track = 'https://soundcloud.com/sbtrkt/sbtrkt-hide-or-seek';

    function play(){
        if (ready && requested && delayComplete && !started) widget.play();
    }

    function init(){
        var container = document.getElementById('soundtrack-player');
        var frame = document.createElement('iframe');
        frame.title = 'SBTRKT — Hide or Seek, SoundCloud preview';
        frame.allow = 'autoplay';
        frame.width = '100%';
        frame.height = '166';
        frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(track) +
            '&auto_play=false&show_artwork=false&show_comments=false&show_reposts=false';
        container.appendChild(frame);
        var note = document.createElement('p');
        note.textContent = 'SoundCloud provides a preview of this track.';
        container.appendChild(note);
        // Account for the player's height in the existing collapsible footer.
        window.dispatchEvent(new Event('resize'));

        var script = document.createElement('script');
        script.src = 'https://w.soundcloud.com/player/api.js';
        script.async = true;
        script.onload = function(){
            widget = SC.Widget(frame);
            widget.bind(SC.Widget.Events.READY, function(){
                ready = true;
                widget.setVolume(20);
                play();
            });
            widget.bind(SC.Widget.Events.PLAY, function(){ started = true; });
            widget.bind(SC.Widget.Events.ERROR, function(){
                ready = false;
                note.textContent = 'Soundtrack unavailable. The scene and sound effects still work.';
            });
        };
        script.onerror = function(){
            note.textContent = 'Use the SoundCloud player below to start the soundtrack.';
        };
        document.head.appendChild(script);
    }

    return {
        init: init,
        start: function(){
            if (requested) { play(); return; }
            requested = true;
            // Let the initial launch effect play before bringing in the music.
            setTimeout(function(){
                delayComplete = true;
                play();
            }, 250);
        }
    };
}());
