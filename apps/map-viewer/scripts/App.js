// (function () {
//     "use strict";

var trustAltitude = false;

function toggleAltitude() {
  var checkBox = document.getElementById("altCheck");
  trustAltitude = checkBox.checked;
}

//from cesium.com/ion/
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyOGMyMTYyMi0yODY5LTRkM2EtYTMzZS03OWVhYmEyZjJkNGQiLCJpZCI6MTI3MTcsInNjb3BlcyI6WyJhc3IiLCJnYyJdLCJpYXQiOjE1NjE2OTU5Njd9.XseHeoSYZMcOBJAkhqA8j1tE5QLAxcWQkH4UIANaUPg';

//////////////////////////////////////////////////////////////////////////
// Creating the Viewer
//////////////////////////////////////////////////////////////////////////

var viewer = new Cesium.Viewer('cesiumContainer', {
  scene3DOnly: true,
  selectionIndicator: false,
  baseLayerPicker: false
});

//////////////////////////////////////////////////////////////////////////
// Loading Imagery
//////////////////////////////////////////////////////////////////////////

// Remove default base layer
// viewer.imageryLayers.remove(viewer.imageryLayers.get(0));

// Add Sentinel-2 imagery
viewer.imageryLayers.addImageryProvider(new Cesium.IonImageryProvider({
  assetId: 3954
}));

//////////////////////////////////////////////////////////////////////////
// Loading Terrain
//////////////////////////////////////////////////////////////////////////

// Load Cesium World Terrain
viewer.terrainProvider = Cesium.createWorldTerrain({
  requestWaterMask: true, // required for water effects
  requestVertexNormals: true // required for terrain lighting
});
// Enable depth testing so things behind the terrain disappear.
viewer.scene.globe.depthTestAgainstTerrain = true;

//////////////////////////////////////////////////////////////////////////
// Configuring the Scene
//////////////////////////////////////////////////////////////////////////

// Enable lighting based on sun/moon positions
viewer.scene.globe.enableLighting = true;

// Create an initial camera view
var homeLat = 42.3601;
var homeLon = -71.0942;
var homeAlt = 39.0;
var HEIGHTBUFFER = 2500.0;
var initialPosition = new Cesium.Cartesian3.fromDegrees(homeLon, homeLat, homeAlt + HEIGHTBUFFER);
var initialOrientation = new Cesium.HeadingPitchRoll.fromDegrees(0.0, -90.0, 0.0);
var homeCameraView = {
  destination: initialPosition,
  orientation: {
    heading: initialOrientation.heading,
    pitch: initialOrientation.pitch,
    roll: initialOrientation.roll
  }
};
// Set the initial view
viewer.scene.camera.setView(homeCameraView);

// Add some camera flight animation options
homeCameraView.duration = 2.0;
// homeCameraView.maximumHeight = 2000;
// homeCameraView.pitchAdjustHeight = 2000;
homeCameraView.endTransform = Cesium.Matrix4.IDENTITY;
// Override the default home button
viewer.homeButton.viewModel.command.beforeExecute.addEventListener(function(e) {
  e.cancel = true;
  viewer.scene.camera.flyTo(homeCameraView);
});

var loadedKML = {};
var kmlPathID = 0; // just a unique id for the kml path file
var csvLoaded = false;
var kmlLoaded = false;
var latList = [];
var lonList = [];
var altList = [];
var focusLat = homeLat;
var focusLon = homeLon;
var focusAlt = homeAlt;

function moveViewToFocusLatLonAlt() {
  var position = new Cesium.Cartesian3.fromDegrees(focusLon, focusLat, focusAlt + HEIGHTBUFFER);
  var orientation = new Cesium.HeadingPitchRoll.fromDegrees(0.0, -90.0, 0.0);
  var cameraView = {
    destination: position,
    orientation: {
      heading: orientation.heading,
      pitch: orientation.pitch,
      roll: orientation.roll
    }
  };
  cameraView.duration = 2.0;
  cameraView.endTransform = Cesium.Matrix4.IDENTITY;
  viewer.scene.camera.flyTo(cameraView);
}

function latLonAltListstoCZML() {
  var coordinates = [];
  if (trustAltitude) {
    lonList.forEach(function(item, index, array) {
      coordinates.push(item);
      coordinates.push(latList[index]);
      coordinates.push(altList[index]);
    });
  } else {
    lonList.forEach(function(item, index, array) {
      coordinates.push(item);
      coordinates.push(latList[index]);
      coordinates.push(0.0);
    });
  }
  var czml = [{
      "id": "document",
      "name": "User Path",
      "version": "1.0"
    },
    {
      "id": "cyanLine",
      "name": "User Path Cyan Line",
      "polyline": {
        "positions": {
          "cartographicDegrees": coordinates
        },
        "material": {
          "solidColor": {
            "color": {
              "rgba": [0, 255, 255, 255]
            }
          }
        },
        "width": 5,
        "clampToGround": !trustAltitude
      }
    }
  ];
  return czml;
}

function loadPathKML() {
  if (!kmlLoaded) {
    try {
      // var kml = latLonAltListstoKML();
      var czml = latLonAltListstoCZML();
      // var dataSource = new Cesium.KmlDataSource();
      var dataSource = new Cesium.CzmlDataSource();

      viewer.dataSources.add(dataSource);

      // dataSource.load(kml);
      dataSource.load(czml);

      loadedKML[kmlPathID] = dataSource;
      kmlLoaded = true;
    } catch (err) {
      window.alert(err.message);
    }
  }
}

function unloadPathKML() {
  if (kmlLoaded) {
    viewer.dataSources.remove(loadedKML[kmlPathID], true);
    delete loadedKML[kmlPathID];
    kmlLoaded = false;
  }
}

function getMeanOfArray(dataArray) {
  if (dataArray.length > 0) {
    var total = 0;
    for (var i = 0; i < dataArray.length; i++) {
      total += dataArray[i];
    }
    return total / dataArray.length;
  } else {
    return 0;
  }
}

function errorHandler(evt) {
  if (evt.target.error.name == "NotReadableError") {
    window.alert("ERROR: Cannot read file!");
    csvLoaded = false;
  }
}

function loadHandler(event) {
  var csv = event.target.result;
  var allTextLines = csv.split(/\r\n|\n/);
  var lines = [];
  var lat_idx = -1;
  var lat_title = 'locationLatitude(WGS84)';
  var lon_idx = -1;
  var lon_title = 'locationLongitude(WGS84)';
  var alt_idx = -1;
  var alt_title = 'locationAltitude(m)';
  try {
    if (allTextLines.length > 0) {
      var lineData = allTextLines[0].split(',');
      for (var i = 0; i < lineData.length; i++) {
        if (lineData[i] == lat_title) {
          lat_idx = i;
        }
        if (lineData[i] == lon_title) {
          lon_idx = i;
        }
        if (lineData[i] == alt_title) {
          alt_idx = i;
        }
      }
    }
    if (lat_idx >= 0 && lon_idx >= 0 && alt_idx >= 0 && allTextLines.length > 1) {
      var latListLength = 0;
      var lonListLength = 0;
      var altListLength = 0;

      for (var i = 1; i < allTextLines.length; i++) {
        var lineData = allTextLines[i].split(',');
        var i_lat = parseFloat(lineData[lat_idx]);
        var i_lon = parseFloat(lineData[lon_idx]);
        var i_alt = parseFloat(lineData[alt_idx]);
        if (!isNaN(i_lat)) {
          latListLength = latList.push(i_lat);
        }
        if (!isNaN(i_lon)) {
          lonListLength = lonList.push(i_lon);
        }
        if (!isNaN(i_alt)) {
          altListLength = altList.push(i_alt);
        }
      }
      if ((latListLength == lonListLength) && (lonListLength == altListLength)) {
        focusLat = getMeanOfArray(latList);
        focusLon = getMeanOfArray(lonList);
        focusAlt = getMeanOfArray(altList);
        csvLoaded = true;
      } else {
        window.alert("ERROR: Numbers of lat, lon, and alt elements do not match.");
        csvLoaded = false;
      }

    } else {
      window.alert("ERROR: Something was wrong with the csv content format!");
      csvLoaded = false;
    }
  } catch (err) {
    window.alert("CSV READ ERROR: " + err.message);
  }
}

function convertCSVtoLatLonAltLists(csvFileName) {
  latList = [];
  lonList = [];
  altList = [];
  focusLat = homeLat;
  focusLon = homeLon;
  focusAlt = homeAlt;

  try {
    var reader = new FileReader();
    reader.readAsText(csvFileName);
    reader.onload = loadHandler;
    reader.onerror = errorHandler;
  } catch (err) {
    window.alert('CSV READ ERROR: ' + err.message);
    csvLoaded = false;
  }
}

function handleFiles(files) {
  csvLoaded = false;
  if (window.FileReader) {
    convertCSVtoLatLonAltLists(files[0]);
  } else {
    alert('FileReader functionality not supported in this browser!');
    csvLoaded = false;
  }
}

function renderKML() {
  unloadPathKML();
  if (csvLoaded) {
    loadPathKML();
    moveViewToFocusLatLonAlt();
  } else {
    window.alert("Please load a valid csv file.");
  }
}
