'use strict';

var $ = window.$;
var console = window.console;

var context; // AudioContext
var MIDIAccess; // WebMIDI or Jazz plugin instance
var MIDIInPort; // currently connected MIDI in port
var convolver;
var volume;
var distortion;
var useDistortion;
var delay;
var mix;
var depth;
var feedback;
var oscillators = {};
var currentType = 'sine'; //set a default value for the wave form


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
function onMIDIKeyDown(noteNumber, velocity){
  var frequency = getFrequency(noteNumber);
  // TODO: may be you should do something with the velocity here?
  //console.log(noteNumber, frequency, velocity);

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

  // distortion doesn't work yet
  if(useDistortion){
    oscillators[noteNumber].connect(distortion);
  }else{
    oscillators[noteNumber].disconnect(distortion);
  }

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


// get the MIDIAccess object either from WebMIDI or a Jazz plugin instance
function setupMIDI(){
  if(navigator.requestMIDIAccess !== undefined){
    navigator.requestMIDIAccess().then(
      function onFulfilled(access, options){
        MIDIAccess = access;
        setupMIDIInPorts();
      },
      function onRejected(e){
        var divInputs = document.getElementById('midi-inputs');
        divInputs.style.display = 'none';
        console.log('No access to MIDI devices:' + e);
      }
    );
  }else{
    // browsers without WebMIDI API or Jazz plugin
    console.log('No access to MIDI devices');
  }
}


// handle incoming messages from a connected MIDI keyboard
function handleMIDIMessage(e){
  var type = e.data[0];
  var data1 = e.data[1];
  var data2 = e.data[2];
  if(type === 144 && data2 !== 0){
    onMIDIKeyDown(data1, data2);
  }else if(type === 128 || (type === 144 && data2 === 0)){
    onMIDIKeyUp(data1);
  }
}


// create dropdown menu with available MIDI in ports
function setupMIDIInPorts(){
  var divInputs = document.getElementById('midi-inputs');
  var html = '<option id="-1">select MIDI in</option>';
  MIDIAccess.inputs.forEach(function(port){
    html += '<option id="' + port.id + '">' + port.name + '</option>';
  });

  divInputs.innerHTML = html;

  divInputs.addEventListener('change', function(){
    var id = divInputs.options[divInputs.selectedIndex].id;
    if(MIDIInPort){
      MIDIInPort.close();
      MIDIInPort.onmidimessage = null;
      MIDIInPort = null;
    }
    if(id !== '-1'){
      MIDIInPort = MIDIAccess.inputs.get(id);
      MIDIInPort.onmidimessage = handleMIDIMessage;
    }
  });
}


// create the onscreen keyboard
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
  var setup = function(){
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
  };
  slider.addEventListener('change', setup);
  setup.call(slider);
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

  $('#flipSwitch').on('change',function(){
    useDistortion = $(this).val() === 'on';
  });
}


function setupEcho(){
  convolver = context.createConvolver();
  var soundSource, concertHallBuffer;  //this is the IR file

  function setup(echo){
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
        }, function(e){
          'Error with decoding audio data' + e.err;
        });
      };

      request.send();
    };
  }

  for(var i = 1; i < 5; i++){
    var echo = document.getElementById('echo' + i);
    echo.onclick = setup(1);
  }
}


// start the app
document.addEventListener('DOMContentLoaded', function(){

  context = new AudioContext();

  setupGain();
  setupDelay();
  setupDistortion();
  setupEcho();
  setupKeyboard(36, 97);
  setupMIDI();

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