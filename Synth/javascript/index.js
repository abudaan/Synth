'use strict';

var $ = window.$;
var context; // AudioContext
var MIDIAccess; // WebMIDI or Jazz plugin instance
var convolver;
var volume;
var distortion;
var delay;
var mix;
var depth;
var feedback;
var oscillators = {};
var currentType = 'sine'; //set a default value for the wave form
var noteNames = {
  'sharp' : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'flat' : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
  'enharmonic-sharp' : ['B#', 'C#', 'C##', 'D#', 'D##', 'E#', 'F#', 'F##', 'G#', 'G##', 'A#', 'A##'],
  'enharmonic-flat' : ['Dbb', 'Db', 'Ebb', 'Eb', 'Fb', 'Gbb', 'Gb', 'Abb', 'Ab', 'Bbb', 'Bb', 'Cb']
};


// get note name from MIDI note number
function getNoteName(number, mode) {
  mode = mode || 'sharp';
  //console.log(mode);
  //var octave = Math.floor((number / 12) - 2), // → in Cubase central C = C3 instead of C4
  var octave = Math.floor((number / 12) - 1),
      noteName = noteNames[mode][number % 12];
  return [noteName,octave];
}


// get frequency from MIDI note number
function getFrequency(number){
  var pitch = 440;
  return pitch * Math.pow(2,(number - 69)/12); // midi standard, see: http://en.wikipedia.org/wiki/MIDI_Tuning_Standard
}


// check if MIDI note number is a black key
function isBlackKey(noteNumber){
  var black;

  switch(true){
    case noteNumber % 12 === 1://C#
    case noteNumber % 12 === 3://D#
    case noteNumber % 12 === 6://F#
    case noteNumber % 12 === 8://G#
    case noteNumber % 12 === 10://A#
      black = true;
      break;
    default:
      black = false;
  }
  return black;
}


// called when a key is pressed either on the virtual HTML piano or on a connected MIDI keyboard
function onMIDIKeyDown(noteNumber, frequency, velocity){
  frequency = getFrequency(noteNumber);
  console.log(noteNumber, frequency, velocity);

  oscillators[noteNumber] = context.createOscillator();
  oscillators[noteNumber].type = currentType;
  oscillators[noteNumber].frequency.value = frequency;

  oscillators[noteNumber].connect(volume);
  oscillators[noteNumber].connect(delay);
  oscillators[noteNumber].connect(distortion);

  delay.connect(mix);
  mix.connect(volume);
  volume.connect(context.destination);

  oscillators[noteNumber].connect(convolver);

  $('#flipSwitch').on('change',function(){
    var sw = $(this).val();
    if(sw == 'on'){
      oscillators[noteNumber].connect(distortion);
    }else{
      oscillators[noteNumber].disconnect(distortion);
    }
  });


  distortion.connect(convolver);
  convolver.connect(volume);
  volume.connect(context.destination);

  //lfo.connect(depth);
  //lfo.start(0)
  //});

  oscillators[noteNumber].start();
}



// called when a key is released either on the virtual HTML piano or on a connected MIDI keyboard
function onMIDIKeyUp(noteNumber){
  oscillators[noteNumber].disconnect();
  //lfo.disconnect();
}


function setupMIDI(){
  if(navigator.requestMIDIAccess !== undefined){
    navigator.requestMIDIAccess().then(

      function onFulfilled(access, options){
        MIDIAccess = access;
        showMIDIPorts();
      },

      function onRejected(e){
        console.log('No access to MIDI devices:' + e);
      }
    );
  }else{
    // browsers without WebMIDI API or Jazz plugin
    console.log('No access to MIDI devices');
  }



  // see this example: http://abudaan.github.io/heartbeat/examples/#!midi_in_&_out/webmidi_create_midi_events
  function showMIDIPorts(){
    console.log('MIDI supported');
    var inputs = [];
    MIDIAccess.inputs.forEach(function(port, key){
      inputs.push(port);
    });
    // connect the first found MIDI keyboard
    var input = inputs[1];
    // explicitly open MIDI port
    input.open();
    input.addEventListener('midimessage', function(e){
      var type = e.data[0];
      var data1 = e.data[1];
      var data2 = e.data[2];
      if(type === 144 && data2 !== 0){
        onMIDIKeyDown(data1, data2);
      }else if(type === 128 || (type === 144 && data2 === 0)){
        onMIDIKeyUp(noteName);
      }
    }, false);
  }
}


function setupKeyboard(start, end){
  var $keyContainer = $('#keys');
  var position = 0;
  var whiteKeyWidth = 27.73;

  for(var i = start; i < end; i++){
    var color = isBlackKey(i) ? 'black' : 'white';
    var $div = $('<div class="' + color + '" id="' + i + '"></div>');

    if(color === 'black'){
      $div.css('left', (position - 10) + 'px');
    }else{
      $div.css('left', position + 'px');
      position += whiteKeyWidth;
    }

    $div.appendTo($keyContainer);

    $div.on('mousedown', function() {
      onMIDIKeyDown(this.id);
    });

    $div.on('mouseup', function() {
      onMIDIKeyUp(this.id);
    });
  }
}


function setupGain(){
  volume = context.createGain();

  var slider = document.getElementById('gainSlider');
    slider.addEventListener('change', function() {
    volume.gain.value = this.value;
  });
}


function setupDelay(){
  delay = context.createDelay();
  mix = context.createGain();  // for effect (Flanger) sound
  depth = context.createGain();  // for LFO
  feedback = context.createGain();

  var slider = document.getElementById('DelaySlider');
  slider.addEventListener('change', setup);
  setup.call(slider);

  function setup(){
    depth.connect(delay.delayTime);
    delay.connect(feedback);
    feedback.connect(delay);
    var depthRate = 0.2;  // 80 %

    if(this.value){
      delay.delayTime.value = this.value;
    } else {
      delay.delayTime.value = 0.0;
    }

    //var lfo = context.createOscillator();
    depth.gain.value = delay.delayTime.value * depthRate;  // 5 msec +- 4 (5 * 0.8) msec
    //lfo.frequency.value = 50;  // 5 Hz
    mix.gain.value = 0.3;
    feedback.gain.value = 0.3;
  }
}


function setupDistortion(){
  distortion = context.createWaveShaper();

  function makeDistortionCurve(amount){
    var k = typeof amount === 'number' ? amount : 50;
    var n_samples = 44100;
    var curve = new Float32Array(n_samples);
    var deg = Math.PI / 180;
    var x;
    for(var i = 0; i < n_samples; ++i){
      x = i * 9 / n_samples - 1;
      curve[i] = ( 7 + k ) * x * 23 * deg / ( Math.PI + k * Math.abs(x) );
    }
    return curve;
  }

  distortion.curve = makeDistortionCurve();
  distortion.oversample = '4x';
}


function setupEcho(){
  convolver = context.createConvolver();
  var soundSource, concertHallBuffer;  //this is the IR file

  function setupEcho(echo){
    return function() {
      var request = new XMLHttpRequest();
      request.open('GET', './audio_files/echo' + echo + '.wav', true);
      request.responseType = 'arraybuffer';

      request.onload = function() {
        var audioData = request.response;
        context.decodeAudioData(audioData, function(buffer) {
          concertHallBuffer = buffer;

          soundSource = context.createBufferSource();
          soundSource.buffer = concertHallBuffer;
          convolver.buffer = concertHallBuffer;
        }, function(e){'Error with decoding audio data' + e.err});
      }

      request.send();
    }
  }

  for(var i = 1; i < 5; i++){
    var echo = document.getElementById('echo' + i);
    echo.onclick = setupEcho(1);
  }
}


document.addEventListener('DOMContentLoaded', function(event) {

  context = new AudioContext();

  setupKeyboard(36, 97);
  setupGain();
  setupDelay();
  setupDistortion();
  setupEcho();

  document.getElementById('triangle').addEventListener('click', function(){
    currentType = 'triangle';
  });
  document.getElementById('square').addEventListener('click', function(){
    currentType = 'square';
  });
  document.getElementById('sine').addEventListener('click', function(){
    currentType = 'sine';
  });
  document.getElementById('sawtooth').addEventListener('click', function(){
    currentType = 'sawtooth';
  });
});