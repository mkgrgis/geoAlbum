/*!
 * Exif v0.1.1
 * https://github.com/fengyuanchen/exif
 *
 * Copyright (c) 2016 Fengyuan Chen
 * Released under the MIT license
 *
 * Date: 2016-04-16T08:19:39.302Z
 */

(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory(global, true);
  } else {
    factory(global);
  }
})(typeof window !== 'undefined' ? window : this, function (window, noGlobal) {

  'use strict';


  // Variables
  // ---------------------------------------------------------------------------

  // Globals
  var ArrayBuffer = window.ArrayBuffer;

  // RegExps
  var REGEXP_DATA_URL = /^data\:/;
  var REGEXP_DATA_URL_HEAD = /^data\:([^\;]+)\;base64,/;
  var REGEXP_DATA_URL_JPEG = /^data\:image\/jpeg.*;base64,/;

  // Utilities
  var objectProto = Object.prototype;
  var toString = objectProto.toString;
  var hasOwnProperty = objectProto.hasOwnProperty;


  // Utilities
  // ---------------------------------------------------------------------------

  function typeOf(obj) {
    return toString.call(obj).slice(8, -1).toLowerCase();
  }

  function isString(str) {
    return typeof str === 'string';
  }

  function isNumber(num) {
    return typeof num === 'number' && !isNaN(num);
  }

  function isObject(obj) {
    return typeof obj === 'object' && obj !== null;
  }

  function isPlainObject(obj) {
    var constructor;
    var prototype;

    if (!isObject(obj)) {
      return false;
    }

    try {
      constructor = obj.constructor;
      prototype = constructor.prototype;

      return constructor && prototype && hasOwnProperty.call(prototype, 'isPrototypeOf');
    } catch (e) {
      return false;
    }
  }

  function isFunction(fn) {
    return typeOf(fn) === 'function';
  }

  function isArray(arr) {
    return Array.isArray ? Array.isArray(arr) : typeOf(arr) === 'array';
  }

  function toArray(obj, offset) {
    var args = [];

    offset = offset >= 0 ? offset : 0;

    if (Array.from) {
      return Array.from(obj).slice(offset);
    }

    return args.slice.call(obj, offset);
  }

  function inArray(value, arr) {
    var index = -1;

    each(arr, function (n, i) {
      if (n === value) {
        index = i;
        return false;
      }
    });

    return index;
  }

  function each(obj, callback) {
    var length;
    var i;

    if (obj && isFunction(callback)) {
      if (isArray(obj) || isNumber(obj.length)/* array-like */) {
        for (i = 0, length = obj.length; i < length; i++) {
          if (callback.call(obj, obj[i], i, obj) === false) {
            break;
          }
        }
      } else if (isObject(obj)) {
        for (i in obj) {
          if (obj.hasOwnProperty(i)) {
            if (callback.call(obj, obj[i], i, obj) === false) {
              break;
            }
          }
        }
      }
    }

    return obj;
  }

  function extend(obj) {
    var args;

    if (arguments.length > 1) {
      args = toArray(arguments);

      if (Object.assign) {
        return Object.assign.apply(Object, args);
      }

      args.shift();

      each(args, function (arg) {
        each(arg, function (prop, i) {
          obj[i] = prop;
        });
      });
    }

    return obj;
  }

  function getStringFromCharCode(dataView, start, length) {
    var str = '';
    var i = start;

    for (length += start; i < length; i++) {
      str += String.fromCharCode(dataView.getUint8(i));
    }

    return str;
  }

  function dataURLToArrayBuffer(dataURL) {
    var base64 = dataURL.replace(REGEXP_DATA_URL_HEAD, '');
    var binary = atob(base64);
    var length = binary.length;
    var arrayBuffer = new ArrayBuffer(length);
    var dataView = new Uint8Array(arrayBuffer);
    var i;

    for (i = 0; i < length; i++) {
      dataView[i] = binary.charCodeAt(i);
    }

    return arrayBuffer;
  }


  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Exif constructor
   *
   * @param {File | Blob | Element | String} image
   * @param {Object} options
   */
  function Exif(image, options) {
    this.image = image;
    this.options = extend({}, Exif.DEFAULTS, isPlainObject(options) && options);
    this.tiffTags = null;
    this.exifTags = null;
    this.gpsTags = null;
    this.interoperabilityTags = null;
    this.init();
  }

  Exif.prototype = {
    constructor: Exif,

    init: function () {
      var _this = this;
      var image = this.image;
      var reader;
      var xhr;

      if (!image || !ArrayBuffer) {
        return;
      }

      // File instance of Blob
      if (image instanceof Blob) {
        reader = new FileReader();

        reader.onerror = reader.onabort = function () {
          _this.readEnd('Fails to read image as ArrayBuffer');
        };

        reader.onload = function () {
          _this.read(this.result);
        };

        reader.readAsArrayBuffer(image);
      } else {
        if (image instanceof HTMLImageElement) {
          image = image.src;
        }

        if (isString(image)) {

          // XMLHttpRequest disallows to open a Data URL in some browsers like IE11 and Safari
          if (REGEXP_DATA_URL.test(image)) {
            return REGEXP_DATA_URL_JPEG.test(image) ?
              this.read(dataURLToArrayBuffer(image)) :
              this.readEnd();
          }

          xhr = new XMLHttpRequest();

          xhr.onerror = xhr.onabort = function () {
            _this.readEnd('Fails to load image as ArrayBuffer');
          };

          xhr.onload = function () {
            _this.read(this.response);
          };

          xhr.open('get', image);
          xhr.responseType = 'arraybuffer';
          xhr.send();
        }
      }
    },

    /**
     * Read the related tags from array buffer
     *
     * Bases on the Exif standard version 2.3 (2012)
     * http://www.cipa.jp/std/documents/e/DC-008-2012_E.pdf
     */
    read: function (arrayBuffer) {
      var options = this.options;
      var dataView = new DataView(arrayBuffer);
      var soiOffset = this.getSOIOffset(dataView);
      var app1Offset = this.getAPP1Offset(dataView, soiOffset + 2);
      var exifIDCode = app1Offset + 4;
      var tiffOffset = app1Offset + 10;
      var firstIFDOffset;
      var littleEndian;
      var endianness;
      var err;

      if (getStringFromCharCode(dataView, exifIDCode, 4) === 'Exif') {
        endianness = dataView.getUint16(tiffOffset);
        littleEndian = endianness === 0x4949;

        if (littleEndian || endianness === 0x4D4D /* bigEndian */) {
          this.littleEndian = littleEndian;

          if (dataView.getUint16(tiffOffset + 2, littleEndian) === 0x002A) {
            firstIFDOffset = dataView.getUint32(tiffOffset + 4, littleEndian);

            if (firstIFDOffset < 0x00000008) {
              err = 'Not valid TIFF data (0th IFD offset less than 8)';
            }
          } else {
            err = 'Not valid TIFF data (no 0x002A)';
          }
        } else {
          err = 'Not valid TIFF data (no 0x4949 or 0x4D4D)';
        }
      } else {
        err = 'Not valid Exif data (no Exif ID code)';
      }

      if (!err) {
        this.dataView = dataView;
        this.tiffOffset = tiffOffset;
        this.tiffTags = this.readTags(firstIFDOffset, Exif.TIFF_TAGS);

        if (options.exif || options.interoperability) {
          this.readExifTags();
        }

        if (options.gps) {
          this.readGPSTags();
        }

        if (options.interoperability) {
          this.readInteroperabilityTags();
        }

        this.dataView = null;
      }

      this.readEnd(err);
    },

    // SOI -> Start of image
    getSOIOffset: function (dataView) {
      var length = dataView.byteLength;
      var offset = 0;
      var soi = 0;

      while (offset < length) {
        if (dataView.getUint8(offset) === 0xFF && dataView.getUint8(offset + 1) === 0xD8) {
          soi = offset;
          break;
        }

        offset++;
      }

      return soi;
    },

    // APP1: Application segment 1
    getAPP1Offset: function (dataView, offset) {
      var length = dataView.byteLength;
      var app1 = offset;

      while (offset < length) {
        if (dataView.getUint8(offset) === 0xFF && dataView.getUint8(offset + 1) === 0xE1) {
          app1 = offset;
          break;
        }

        offset++;
      }

      return app1;
    },

    readTags: function (ifdOffset, tagNames) {
      var options = this.options;
      var ignored = options.ignored;
      var dataView = this.dataView;
      var ifdStart = this.tiffOffset + ifdOffset;
      var littleEndian = this.littleEndian;
      var length = dataView.getUint16(ifdStart, littleEndian);
      var tags = {};
      var tagName;
      var tagValue;
      var tagValueOptions;
      var offset;
      var i;

      if (!isArray(ignored) || !ignored.length) {
        ignored = false;
      }

      for (i = 0; i < length; i++) {
        offset = ifdStart + i * 12 + 2;
        tagName = tagNames[dataView.getUint16(offset, littleEndian)];

        if (tagName) {
          if (ignored && inArray(tagName, ignored) > -1) {
            continue;
          }

          tagValue = this.readTagValue(offset, tagName);
          tagValueOptions = Exif.TAG_VALUE_OPTIONS[tagName];

          if (tagValueOptions && isNumber(tagValue)) {
            tagValue = tagValueOptions[tagValue];
          }

          tags[tagName] = tagValue;
        }
      }

      return tags;
    },

    readTagValue: function (tagOffset, tagName) {
      var dataView = this.dataView;
      var littleEndian = this.littleEndian;
      var typeOffset = tagOffset + 2;
      var countOffset = tagOffset + 4;
      var valueOffsetOffset = tagOffset + 8;
      var type = dataView.getUint16(typeOffset, littleEndian);
      var count = dataView.getUint32(countOffset, littleEndian);
      var valueOffset = this.tiffOffset + dataView.getUint32(valueOffsetOffset, littleEndian);
      var denominator;
      var numerator;
      var offset;
      var value;
      var i;

      switch (type) {

        // BYTE: An 8-bit unsigned integer
        case 1:
          // Fall through

        // UNDEFINED: An 8-bit byte that may take any value depending on the field definition
        case 7:
          if (count === 1) {
            value = dataView.getUint8(valueOffsetOffset, littleEndian);
          } else {
            offset = count > 4 ? valueOffset : valueOffsetOffset;

            if (inArray(tagName, [
              'ExifVersion',
              'FlashpixVersion'
            ]) > -1) {
              value = getStringFromCharCode(dataView, offset, count);
            } else {
              value = [];

              for (i = 0; i < count; i++) {
                value[i] = dataView.getUint8(offset + i);
              }
            }
          }

          break;

        // ASCII: An 8-bit byte containing one 7-bit ASCII code
        case 2:
          offset = count > 4 ? valueOffset : valueOffsetOffset;
          value = getStringFromCharCode(dataView, offset, count - 1);
          break;

        // SHORT: An 16-bit (2-byte) unsigned integer
        case 3:
          if (count === 1) {
            value = dataView.getUint16(valueOffsetOffset, littleEndian);
          } else {
            offset = count > 2 ? valueOffset : valueOffsetOffset;
            value = [];

            for (i = 0; i < count; i++) {
              value[i] = dataView.getUint16(offset + 2 * i, littleEndian);
            }
          }

          break;

        // LONG: An 32-bit (4-byte) unsigned integer
        case 4:
          if (count === 1) {
            value = dataView.getUint32(valueOffsetOffset, littleEndian);
          } else {
            value = [];

            for (i = 0; i < count; i++) {
              value[i] = dataView.getUint32(valueOffset + 4 * i, littleEndian);
            }
          }

          break;

        // RATIONAL: Two LONGs. The first LONG is the numerator and the second LONG is the denominator
        case 5:
          if (count === 1) {
            numerator = dataView.getUint32(valueOffset, littleEndian);
            denominator = dataView.getUint32(valueOffset + 4, littleEndian);
            value = numerator / denominator;
          } else {
            value = [];

            for (i = 0; i < count; i++) {
              numerator = dataView.getUint32(valueOffset + 8 * i, littleEndian);
              denominator = dataView.getUint32(valueOffset + 4 + 8 * i, littleEndian);
              value[i] = numerator / denominator;
            }
          }

          break;

        // SLONG: A 32-bit (4-byte) signed integer (2's complement notation)
        case 9:
          if (count === 1) {
            value = dataView.getInt32(valueOffsetOffset, littleEndian);
          } else {
            value = [];

            for (i = 0; i < count; i++) {
              value[i] = dataView.getInt32(valueOffset + 4 * i, littleEndian);
            }
          }

          break;

        // SRATIONAL: Two SLONGs. The first SLONG is the numerator and the second SLONG is the denominator
        case 10:
          if (count === 1) {
            numerator = dataView.getInt32(valueOffset, littleEndian);
            denominator = dataView.getInt32(valueOffset + 4, littleEndian);
            value = numerator / denominator;
          } else {
            value = [];
            for (i = 0; i < count; i++) {
              numerator = dataView.getInt32(valueOffset + 8 * i, littleEndian);
              denominator = dataView.getInt32(valueOffset + 4 + 8 * i, littleEndian);
              value[i] = numerator / denominator;
            }
          }

          break;
      }

      return value;
    },

    readExifTags: function () {
      var tiffTags = this.tiffTags;
      var offset = tiffTags && tiffTags.ExifIFDPointer;

      if (offset) {
        this.exifTags = this.readTags(offset, Exif.EXIF_TAGS);
      }
    },

    readGPSTags: function () {
      var tiffTags = this.tiffTags;
      var offset = tiffTags && tiffTags.GPSInfoIFDPointer;

      if (offset) {
        this.gpsTags = this.readTags(offset, Exif.GPS_TAGS);
      }
    },

    readInteroperabilityTags: function () {
      var exifTags = this.exifTags;
      var offset = exifTags && exifTags.InteroperabilityIFDPointer;

      if (offset) {
        this.interoperabilityTags = this.readTags(offset, Exif.INTEROPERABILITY_TAGS);
      }
    },

    readEnd: function (err) {
      var options = this.options;

      if (err) {
        if (isFunction(options.fail)) {
          options.fail.call(this, err);
        }
      } else {
        if (isFunction(options.done)) {
          options.done.call(this, this.getTags());
        }
      }
    },

    getTags: function () {
      var options = this.options;

      return extend(
        {},
        this.tiffTags,
        options.exif && this.exifTags,
        options.gps && this.gpsTags,
        options.interoperability && this.interoperabilityTags
      );
    }
  };

  Exif.DEFAULTS = {

    // Boolean: read Exif tags
    exif: true,

    // Boolean: read GPS tags
    gps: true,

    // Boolean: read interoperability tags
    interoperability: true,

    // Array: ignored tags
    ignored: [
      'MakerNote',
      'UserComment'
    ],

    // Function: callbacks
    done: null,
    fail: null
  };


  // Tags
  // ---------------------------------------------------------------------------

  // TIFF Rev. 6.0: http://partners.adobe.com/public/developer/en/tiff/TIFF6.pdf
  Exif.TIFF_TAGS = {

    // Tags relating to image data structure
    0x0100: 'ImageWidth',
    0x0101: 'ImageLength',
    0x0102: 'BitsPerSample',
    0x0103: 'Compression',
    0x0106: 'PhotometricInterpretation',
    0x0112: 'Orientation',
    0x0115: 'SamplesPerPixel',
    0x011C: 'PlanarConfiguration',
    0x0212: 'YCbCrSubSampling',
    0x0213: 'YCbCrPositioning',
    0x011A: 'XResolution',
    0x011B: 'YResolution',
    0x0128: 'ResolutionUnit',

    // Tags relating to recording offset
    0x0111: 'StripOffsets',
    0x0116: 'RowsPerStrip',
    0x0117: 'StripByteCounts',
    0x0201: 'JPEGInterchangeFormat',
    0x0202: 'JPEGInterchangeFormatLength',

    // Tags relating to image data characteristics
    0x012D: 'TransferFunction',
    0x013E: 'WhitePoint',
    0x013F: 'PrimaryChromaticities',
    0x0211: 'YCbCrCoefficients',
    0x0214: 'ReferenceBlackWhite',

    // Other tags
    0x0132: 'DateTime',
    0x010E: 'ImageDescription',
    0x010F: 'Make',
    0x0110: 'Model',
    0x0131: 'Software',
    0x013B: 'Artist',
    0x8298: 'Copyright',

    // Exif IFD
    0x8769: 'ExifIFDPointer',

    // GPS IFD
    0x8825: 'GPSInfoIFDPointer'
  };

  Exif.EXIF_TAGS = {

    // Tags relating to version
    0x9000: 'ExifVersion',
    0xA000: 'FlashpixVersion',

    // Tags relating to image data characterictics
    0xA001: 'ColorSpace',
    0xA500: 'Gamma',

    // Tags relating to image configuration
    0x9101: 'ComponentsConfiguration',
    0x9102: 'CompressedBitsPerPixel',
    0xA002: 'PixelXDimension',
    0xA003: 'PixelYDimension',

    // Tags relating to user information
    0x927C: 'MakerNote',
    0x9286: 'UserComment',

    // Tags relating to related file information
    0xA004: 'RelatedSoundFile',

    // Tags relating to date and time
    0x9003: 'DateTimeOriginal',
    0x9004: 'DateTimeDigitized',
    0x9290: 'SubsecTime',
    0x9291: 'SubsecTimeOriginal',
    0x9292: 'SubsecTimeDigitized',

    // Tags relating to picture-taking conditions
    0x829A: 'ExposureTime',
    0x829D: 'FNumber',
    0x8822: 'ExposureProgram',
    0x8824: 'SpectralSensitivity',
    0x8827: 'PhotographicSensitivity',
    0x8828: 'OECF',
    0x8830: 'SensitivityType',
    0x8831: 'StandardOutputSensitivity',
    0x8832: 'RecommendedExposureIndex',
    0x8833: 'ISOSpeed',
    0x8834: 'ISOSpeedLatitudeyyy',
    0x8835: 'ISOSpeedLatitudezzz',
    0x9201: 'ShutterSpeedValue',
    0x9202: 'ApertureValue',
    0x9203: 'BrightnessValue',
    0x9204: 'ExposureBiasValue',
    0x9205: 'MaxApertureValue',
    0x9206: 'SubjectDistance',
    0x9207: 'MeteringMode',
    0x9208: 'LightSource',
    0x9209: 'Flash',
    0x920A: 'FocalLength',
    0x9214: 'SubjectArea',
    0xA20B: 'FlashEnergy',
    0xA20C: 'SpatialFrequencyResponse',
    0xA20E: 'FocalPlaneXResolution',
    0xA20F: 'FocalPlaneYResolution',
    0xA210: 'FocalPlaneResolutionUnit',
    0xA214: 'SubjectLocation',
    0xA215: 'ExposureIndex',
    0xA217: 'SensingMethod',
    0xA300: 'FileSource',
    0xA301: 'SceneType',
    0xA302: 'CFAPattern',
    0xA401: 'CustomRendered',
    0xA402: 'ExposureMode',
    0xA403: 'WhiteBalance',
    0xA404: 'DigitalZoomRatio',
    0xA405: 'FocalLengthIn35mmFilm',
    0xA406: 'SceneCaptureType',
    0xA407: 'GainControl',
    0xA408: 'Contrast',
    0xA409: 'Saturation',
    0xA40A: 'Sharpness',
    0xA40B: 'DeviceSettingDescription',
    0xA40C: 'SubjectDistanceRange',

    // Other tags
    0xA420: 'ImageUniqueID',
    0xA430: 'CameraOwnerName',
    0xA431: 'BodySerialNumber',
    0xA432: 'LensSpecification',
    0xA433: 'LensMake',
    0xA434: 'LensModel',
    0xA435: 'LensSerialNumber',

    // Interoperability IFD
    0xA005: 'InteroperabilityIFDPointer'
  };

  Exif.GPS_TAGS = {

    // Tags relating to GPS
    0x0000: 'GPSVersionID',
    0x0001: 'GPSLatitudeRef',
    0x0002: 'GPSLatitude',
    0x0003: 'GPSLongitudeRef',
    0x0004: 'GPSLongitude',
    0x0005: 'GPSAltitudeRef',
    0x0006: 'GPSAltitude',
    0x0007: 'GPSTimeStamp',
    0x0008: 'GPSSatellites',
    0x0009: 'GPSStatus',
    0x000A: 'GPSMeasureMode',
    0x000B: 'GPSDOP',
    0x000C: 'GPSSpeedRef',
    0x000D: 'GPSSpeed',
    0x000E: 'GPSTrackRef',
    0x000F: 'GPSTrack',
    0x0010: 'GPSImgDirectionRef',
    0x0011: 'GPSImgDirection',
    0x0012: 'GPSMapDatum',
    0x0013: 'GPSDestLatitudeRef',
    0x0014: 'GPSDestLatitude',
    0x0015: 'GPSDestLongitudeRef',
    0x0016: 'GPSDestLongitude',
    0x0017: 'GPSDestBearingRef',
    0x0018: 'GPSDestBearing',
    0x0019: 'GPSDestDistanceRef',
    0x001A: 'GPSDestDistance',
    0x001B: 'GPSProcessingMethod',
    0x001C: 'GPSAreaInformation',
    0x001D: 'GPSDateStamp',
    0x001E: 'GPSDifferential',
    0x001F: 'GPSHPositioningError'
  };

  Exif.INTEROPERABILITY_TAGS = {

    // Attached information related to interoperability
    0x0001: 'InteroperabilityIndex'
  };

  Exif.TAG_VALUE_OPTIONS = {
    Compression: {
      1: 'Uncompressed',
      6: 'JPEG compression'
    },
    PhotometricInterpretation: {
      1: 'RGB',
      6: 'YCbCr'
    },
    PlanarConfiguration: {
      1: 'Chunky format',
      2: 'Planar format'
    },
    YCbCrPositioning: {
      1: 'Centered',
      2: 'Co-sited'
    },
    ResolutionUnit: {
      1: 'Inches',
      2: 'Centimeters'
    },
    ColorSpace: {
      1: 'sRGB',
      0xFFFF: 'Uncalibrated'
    },
    ComponentsConfiguration: {
      0: 'Does not exist',
      1: 'Y',
      2: 'Cb',
      3: 'Cr',
      4: 'R',
      5: 'G',
      6: 'B'
    },
    ExposureProgram: {
      0: 'Not defined',
      1: 'Manual',
      2: 'Normal program',
      3: 'Aperture priority',
      4: 'Shutter priority',
      5: 'Creative program (based toward depth of field)',
      6: 'Action program (based toward fast shutter speed)',
      7: 'Portrait mode (for closeup photos with the background out of focus)',
      8: 'Landscape mode (for landscape photos with the background in focus)'
    },
    SensitivityType: {
      0: 'Unknown',
      1: 'Standard output sensitivity (SOS)',
      2: 'Recommended exposure index (REI)',
      3: 'ISO speed',
      4: 'Standard output sensitivity (SOS) and recommended exposure index (REI)',
      5: 'Standard output sensitivity (SOS) and ISO speed',
      6: 'Recommended exposure index (REI) and ISO speed',
      7: 'Standard output sensitivity (SOS) and recommended exposure index (REI) and ISO speed'
    },
    MeteringMode: {
      0: 'Unknown',
      1: 'Average',
      2: 'CenterWeightedAverage',
      3: 'Spot',
      4: 'MultiSpot',
      5: 'Pattern',
      6: 'Partial',
      255: 'Other'
    },
    LightSource: {
      0: 'Unknown',
      1: 'Daylight',
      2: 'Fluorescent',
      3: 'Tungsten (incandescent light)',
      4: 'Flash',
      9: 'Fine weather',
      10: 'Cloudy weather',
      11: 'Shade',
      12: 'Daylight fluorescent (D 5700 - 7100K)',
      13: 'Day white fluorescent (N 4600 - 5500K)',
      14: 'Cool white fluorescent (W 3800 - 4500K)',
      15: 'White fluorescent (WW 3250 - 3800K)',
      16: 'Warm white fluorescent (WW 2600 - 3250K)',
      17: 'Standard light A',
      18: 'Standard light B',
      19: 'Standard light C',
      20: 'D55',
      21: 'D65',
      22: 'D75',
      23: 'D50',
      24: 'ISO studio tungsten',
      255: 'Other light source'
    },

    // http://www.awaresystems.be/imaging/tiff/tifftags/privateifd/exif/flash.html
    Flash: {
      0x0000: 'Flash did not fire',
      0x0001: 'Flash fired',
      0x0005: 'Strobe return light not detected',
      0x0007: 'Strobe return light detected',
      0x0009: 'Flash fired, compulsory flash mode',
      0x000D: 'Flash fired, compulsory flash mode, return light not detected',
      0x000F: 'Flash fired, compulsory flash mode, return light detected',
      0x0010: 'Flash did not fire, compulsory flash mode',
      0x0018: 'Flash did not fire, auto mode',
      0x0019: 'Flash fired, auto mode',
      0x001D: 'Flash fired, auto mode, return light not detected',
      0x001F: 'Flash fired, auto mode, return light detected',
      0x0020: 'No flash function',
      0x0041: 'Flash fired, red-eye reduction mode',
      0x0045: 'Flash fired, red-eye reduction mode, return light not detected',
      0x0047: 'Flash fired, red-eye reduction mode, return light detected',
      0x0049: 'Flash fired, compulsory flash mode, red-eye reduction mode',
      0x004D: 'Flash fired, compulsory flash mode, red-eye reduction mode, return light not detected',
      0x004F: 'Flash fired, compulsory flash mode, red-eye reduction mode, return light detected',
      0x0059: 'Flash fired, auto mode, red-eye reduction mode',
      0x005D: 'Flash fired, auto mode, return light not detected, red-eye reduction mode',
      0x005F: 'Flash fired, auto mode, return light detected, red-eye reduction mode'
    },
    SensingMethod: {
      1: 'Not defined',
      2: 'One-chip color area sensor',
      3: 'Two-chip color area sensor',
      4: 'Three-chip color area sensor',
      5: 'Color sequential area sensor',
      7: 'Trilinear sensor',
      8: 'Color sequential linear sensor'
    },
    FileSource: {
      0: 'Others',
      1: 'Scanner of transparent type',
      2: 'Scanner of reflex type',
      3: 'DSC'
    },
    SceneType: {
      1: 'A directly photographed image'
    },
    CustomRendered: {
      0: 'Normal process',
      1: 'Custom process'
    },
    ExposureMode: {
      0: 'Auto exposure',
      1: 'Manual exposure',
      2: 'Auto bracket'
    },
    WhiteBalance: {
      0: 'Auto white balance',
      1: 'Manual white balance'
    },
    SceneCaptureType: {
      0: 'Standard',
      1: 'Landscape',
      2: 'Portrait',
      3: 'Night scene'
    },
    GainControl: {
      0: 'None',
      1: 'Low gain up',
      2: 'High gain up',
      3: 'Low gain down',
      4: 'High gain down'
    },
    Contrast: {
      0: 'Normal',
      1: 'Soft',
      2: 'Hard'
    },
    Saturation: {
      0: 'Normal',
      1: 'Low saturation',
      2: 'High saturation'
    },
    Sharpness: {
      0: 'Normal',
      1: 'Soft',
      2: 'Hard'
    },
    SubjectDistanceRange: {
      0: 'Unknown',
      1: 'Macro',
      2: 'Close view',
      3: 'Distant view'
    }
  };


  // No Conflict
  // ---------------------------------------------------------------------------

  var _Exif = window.Exif;

  Exif.noConflict = function () {
    window.Exif = _Exif;
    return Exif;
  };


  // Export
  // ---------------------------------------------------------------------------

  if (typeof define === 'function' && define.amd) {
    define('exif', [], function () {
      return Exif;
    });
  }

  if (typeof noGlobal === 'undefined') {
    window.Exif = Exif;
  }

  return Exif;

});
