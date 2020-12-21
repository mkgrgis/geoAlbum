OsmGeoDocLib = function (OSM_baseURL, OSM_API_URL){
	// Три типа ОСМ объектов - теги для разбора, части адреса, необходимость выборки внутренностей и название
	this.osm_tag = ['osm_nd_id', 'osm_w_id', 'osm_rl_id'];
	this.osm_type = ['node', 'way', 'relation'];
	this.osm_suff = ['', 'full', 'full']; // Суффикс получения блока полных данных
	this.osm_title = ['Точка', 'Линия', 'Отношение'];
	this.OSM_baseURL = OSM_baseURL ?? 'https://www.openstreetmap.org'; // Хранилище ОСМ данных здесь
	// Теги, определяющие, что графический блок имеет географические координаты
	this.geoImageDivTags = ['lon', 'lat', ...this.osm_tag, 'coordinates', 'flickr_id'/*, 'panoramio_id'*/];
	this.OSM_API_URL = OSM_baseURL ?? (this.OSM_baseURL + '/api/0.6/'); //Выборка объектов отсюда;
	// Формирует одрес ОСМ объекта
	this.OSM_URL = function (type, id, suff) {
		var _smod = (suff != '') ? '/' + suff : '';
		return 	this.OSM_API_URL + type + '/' + id + _smod;
	};
	
	// Асинхронное получение файла
	this.OSM_layer_request = function (req_par, GA) {
		var i = this.osm_type.indexOf(req_par.type);
		var url = this.OSM_URL(req_par.type, req_par.id, this.osm_suff[i]);
		var xhr = new XMLHttpRequest();
		xhr.req_par = req_par;
		xhr.url = url;
		xhr.GA = GA;
		xhr.open('GET', url, true);
		xhr.send();
		xhr.onreadystatechange = function () {
			if (xhr.readyState != 4) return;
			if (xhr.status != 200 && (xhr.status != 0 || xhr.response)) {
				console.warn("Такого объекта нет в БД OSM! " + xhr.req_par.id + " " + xhr.req_par.type + " " + xhr.url);
			} else
				xhr.GA.OSM_layer_include(xhr);
		};
	};
	
	// Выбирает широту и долготу из XML узла единстственной точки в формате OSM
	this.OSM_xml_node_geo = function (OSM_node) {
		return [parseFloat(OSM_node.getAttribute('lat')), parseFloat(OSM_node.getAttribute('lon'))];
	};
	
	// Вычисляет среднее геометрическое массива координат
	this.φλ_avg = function (φλ) {
		if (φλ.length == 1)
			return φλ[0];
		var φ = []; var λ = [];
		for (var i in φλ) {
			if (φλ[i] != null) {
				φ.push(φλ[i][0]);
				λ.push(φλ[i][1]);
			}
		}
		var minφ = Math.min.apply(null, φ);
		var maxφ = Math.max.apply(null, φ);
		var avg_φ = (minφ + maxφ) / 2;
		var minλ = Math.min.apply(null, λ);
		var maxλ = Math.max.apply(null, λ);
		var avg_λ = (minλ + maxλ) / 2;
		return [avg_φ, avg_λ];
	};
	
	// Усреднение в массиве geoDiv
	this.avgGeoDivs = function (a) {
		var φλ = [];
		for (var i in a) {
			if (!a[i].NaNGeo()) {
				φλ.push(a[i].φλ);
			}
		}
		return this.φλ_avg(φλ);
	};
	
	// Вычисляет среднее геометрическое точек из OSM XML документа
	this.OSM_node_avg = function (xml) {
		var φλ = [];
		var el = xml.getElementsByTagName('node');
		for (var i = 0; i < el.length; i++) {
			φλ.push([el[i].getAttribute('lat'),
			el[i].getAttribute('lon')]);
		}
		return this.φλ_avg(φλ);
	};
	
	// По коду точки в OSM возвращает объект с широтой и долготой.
	this.OSM_node_geo = function (xml, id, φλ = true) {
		var nodes = xml.getElementsByTagName('node');
		var nd = {};
		for (var i = 0; i < nodes.length; i++) {
			if (nodes[i].getAttribute('id') == id)
				nd = nodes[i];
		}
		if (!nd)
			return null;
		var osmg = this.OSM_xml_node_geo(nd);
		if (φλ)
			return osmg;
		return [osmg[1], osmg[0]];
	};
	
	// Удаляет точки из geoJSON отношения или линии
	this.geoJsonRemoveOsmNodes = function (geoJson) {
		for (var i = 0; i < geoJson.features.length; i++) {
			if (geoJson.features[i].geometry.type == 'Point') {
				geoJson.features.splice(i, 1);
				i--;
			}
		}
		return geoJson;
	};
	
	// Получает из документа ветвь отношения с данным кодом
	this.getRelationXmlTree = function (xml, osm_rl_id) {
		var relations = xml.getElementsByTagName('relation');
		for (var i = 0; i < relations.length; i++) {
			if (relations[i].getAttribute('id') == osm_rl_id)
				return relations[i];
		}
		return null;
	};
	
	// Получает массив номеров отношений, содержащих подчинённые территории
	this.getSubAreas = function (xml, osm_rl_id) {
		var relXml = this.getRelationXmlTree(xml, osm_rl_id);
		if (!relXml)
			return null;
		var subAreas = [];
		var members = relXml.getElementsByTagName('member');
		var j = 0;
		for (var i = 0; i < members.length; i++) {
			if (members[i].getAttribute('type') == 'relation' && members[i].getAttribute('role') == 'subarea')
				subAreas[j++] = members[i].getAttribute('ref');
		}
		return subAreas;
	};
	
	// Удаляет чужие полигоны из документа, оставляя собственный полигон заданного отношения
	this.geoJsonDecomposeSubAreas = function (geoJson, osm_rl_id) {
		var subrel = []; var j = 0;
		for (var i = 0; i < geoJson.features.length; i++) {
			if (geoJson.features[i].geometry.type.indexOf('Polygon') + 1)
				if (geoJson.features[i].id.indexOf('relation/') + 1) {
					if (geoJson.features[i].id != 'relation/' + osm_rl_id) {
						geoJson.features.splice(i--, 1);
					}
				}
				else // Полигоны от линий удаляем
					geoJson.features.splice(i--, 1);
		}
		return geoJson;
	};
	
	// Оставляет собственный полигон заданного отношения
	this.relationSelfPolygon = function (geoJson, osm_rl_id) {
		for (var i = 0; i < geoJson.features.length; i++) {
			if ((geoJson.features[i].geometry.type.indexOf('Polygon') + 1) &&
				(geoJson.features[i].id == 'relation/' + osm_rl_id))
				return i;
		}
		return null;
	};
	
	// Получить значение данного тега
	this.getOsmTag = function (xml, type, osm_id, tag) {
		var ok = null;
		var elements = xml.getElementsByTagName(type);
		for (var i = 0; i < elements.length; i++) {
			if (elements[i].getAttribute('id') == osm_id) {
				ok = ' ';
				break;
			}
		}
		if (!ok)
			return null;
		var tags = elements[i].getElementsByTagName('tag');
		for (var j = 0; j < tags.length; j++) {
			if (tags[j].getAttribute('k') == tag)
				return tags[j].getAttribute('v');
		}
		return null;
	};
	
	// Создание GeoJson из основного контура отношения, представленного в xml документе
	this.osmRelationGeoJson = function (xml, rel_id) {
		var geoJson0 = osmtogeojson(xml);
		var geoJson1 = this.geoJsonRemoveOsmNodes(geoJson0);
		var geoJson2 = this.geoJsonDecomposeSubAreas(geoJson1, rel_id);
		geoJson2.osm_rel_id = rel_id;
		return geoJson2;
	};
	
	// Добавляет ссылку на объявленные в свойствах объекты OSM после последнего элемента секции.
	this.OSM_href = function (div, id, type) {
		var e = document.createElement('br');
		div.appendChild(e);
		var e = document.createElement('a');
		e.href = this.OSM_baseURL + '/' + type + '/' + id;
		var i = this.osm_type.indexOf(type);
		e.appendChild(document.createTextNode(this.osm_title[i] + ' OSM'));
		div.appendChild(e);
		div.appendChild(document.createTextNode(' '));
		var e = document.createElement('a');
		e.href = this.OSM_URL(type, id, this.osm_suff[i]);
		e.appendChild(document.createTextNode('Координаты с OSM в XML'));
		div.appendChild(e);
		return e.href;
	};

	this.γεωμετρία = {
		len : function (geometry) { // Блок вычисления длины
			if (geometry.type === 'LineString')
				return geoJSON_len(geometry.coordinates);
			else if (geometry.type === 'MultiLineString')
				return geometry.coordinates.reduce(function (memo, coordinates) {
					return memo + geoJSON_len(coordinates);
				}, 0);
			else
				return null;
		
			function geoJSON_len(lineString) {
				if (lineString.length < 2)
					return 0;
				var result = 0;
				for (var i = 1; i < lineString.length; i++)
					result += distance(lineString[i - 1][0], lineString[i - 1][1],
						lineString[i][0], lineString[i][1]);
				return result;
			}
		
			/**
			 * Calculate the approximate distance between two coordinates (lat/lon)
			 *
			 * © Chris Veness, MIT-licensed,
			 * http://www.movable-type.co.uk/scripts/latlong.html#equirectangular
			 */
			function distance(λ1, φ1, λ2, φ2) {
				var R = 6371000;
				var Δλ = (λ2 - λ1) * Math.PI / 180;
				φ1 = φ1 * Math.PI / 180;
				φ2 = φ2 * Math.PI / 180;
				var x = Δλ * Math.cos((φ1 + φ2) / 2);
				var y = (φ2 - φ1);
				var d = Math.sqrt(x * x + y * y);
				return R * d;
			};
		// Блок вычисления длины
		},
		sqf : function (_) { // Блок вычисления площади
			var area = 0, i;
			switch (_.type) {
				case 'LineString':
				case 'MultiLineString':
				case 'Polygon':
					return polygonArea(_.coordinates);
				case 'MultiPolygon':
					for (i = 0; i < _.coordinates.length; i++) {
						area += polygonArea(_.coordinates[i]);
					}
					return area;
				case 'Point':
					return 0;
				case 'GeometryCollection':
					for (i = 0; i < _.geometries.length; i++) {
						area += explication.γεωμετρία.sqf(_.geometries[i]);
					}
					return area;
			}		
			function polygonArea(coords) {
				var area = 0;
				if (coords && coords.length > 0) {
					area += Math.abs(ringArea(coords[0]));
					for (var i = 1; i < coords.length; i++) {
						area -= Math.abs(ringArea(coords[i]));
					}
				}
				return area;
			}
		
			/**
			 * Calculate the approximate area of the polygon were it projected onto
			 *	 the earth.  Note that this area will be positive if ring is oriented
			 *	 clockwise, otherwise it will be negative.
			 *
			 * Reference:
			 * Robert. G. Chamberlain and William H. Duquette, "Some Algorithms for
			 *	 Polygons on a Sphere", JPL Publication 07-03, Jet Propulsion
			 *	 Laboratory, Pasadena, CA, June 2007 http://trs-new.jpl.nasa.gov/dspace/handle/2014/40409
			 *
			 * Returns:
			 * {float} The approximate signed geodesic area of the polygon in square
			 *	 meters.
			 */
		
			function ringArea(coords) {
				var p1, p2, p3, lowerIndex, middleIndex, upperIndex, i,
					area = 0,
					coordsLength = coords.length;
		
				var wgs84 = {};
				wgs84.RADIUS = 6378137;
				wgs84.FLATTENING_DENOM = 298.257223563
				wgs84.FLATTENING = 1 / wgs84.FLATTENING_DENOM.FLATTENING_DENOM;
				wgs84.POLAR_RADIUS = wgs84.RADIUS * (1 - wgs84.FLATTENING);
		
				if (coordsLength > 2) {
					for (i = 0; i < coordsLength; i++) {
						if (i === coordsLength - 2) {// i = N-2
							lowerIndex = coordsLength - 2;
							middleIndex = coordsLength - 1;
							upperIndex = 0;
						} else if (i === coordsLength - 1) {// i = N-1
							lowerIndex = coordsLength - 1;
							middleIndex = 0;
							upperIndex = 1;
						} else { // i = 0 to N-3
							lowerIndex = i;
							middleIndex = i + 1;
							upperIndex = i + 2;
						}
						p1 = coords[lowerIndex];
						p2 = coords[middleIndex];
						p3 = coords[upperIndex];
						area += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]));
					}
		
					area = area * wgs84.RADIUS * wgs84.RADIUS / 2;
				}
				return area;
			}
		
			function rad(_) {
				return _ * Math.PI / 180;
			}
		// Блок вычисления площади
		},		
		// Выделение массива точек из geoJSON
		geo_nodes : function (geoJSONel) { 
			var nd = [];
			var g = geoJSONel.geometry;
			if (g.type == 'Point') {
				nd.push(g.coordinates);
				return nd;
			}
			if (g.type == 'LineString' || g.type == 'MultiPoint')
				return g.coordinates;
			if (g.type == 'Polygon' || g.type == 'MultiLineString') {
				for (var i in g.coordinates) {
					Array.prototype.push.apply(nd, g.coordinates[i]);
				}
				return nd;
			}
			if (g.type == 'MultiPolygon') {
				for (var i in g.coordinates) {
					var ci = g.coordinates[i];
					for (var j in ci) {
						Array.prototype.push.apply(nd, ci[j]);
					}
				}
				return nd;
			}
			return null;
		},		
		// Блок геометрического анализа принадлежности из библиотеки https://turfjs.org/docs/
		booleanPointInPolygon : function (point, polygon, options) {
			function inRing(pt, ring, ignoreBoundary) {
				var isInside = false;
				if (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1])
					ring = ring.slice(0, ring.length - 1);		
				for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
					var xi = ring[i][0], yi = ring[i][1];
					var xj = ring[j][0], yj = ring[j][1];
					var onBoundary = (pt[1] * (xi - xj) + yi * (xj - pt[0]) + yj * (pt[0] - xi) === 0) &&
						((xi - pt[0]) * (xj - pt[0]) <= 0) && ((yi - pt[1]) * (yj - pt[1]) <= 0);
					if (onBoundary)
						return !ignoreBoundary;
					var intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
						(pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
					if (intersect) isInside = !isInside;
				}
				return isInside;
			}
			function getCoord(obj) {
				if (!obj) throw new Error('obj is required');
		
				var coordinates = getCoords(obj);
		
				// getCoord() must contain at least two numbers (Point)
				if (coordinates.length > 1 && isNumber(coordinates[0]) && isNumber(coordinates[1])) {
					return coordinates;
				} else {
					throw new Error('Coordinate is not a valid Point');
				}
			}
			function getCoords(obj) {
				if (!obj) throw new Error('obj is required');
				var coordinates;
		
				// Array of numbers
				if (obj.length) {
					coordinates = obj;
		
					// Geometry Object
				} else if (obj.coordinates) {
					coordinates = obj.coordinates;
		
					// Feature
				} else if (obj.geometry && obj.geometry.coordinates) {
					coordinates = obj.geometry.coordinates;
				}
				// Checks if coordinates contains a number
				if (coordinates) {
					containsNumber(coordinates);
					return coordinates;
				}
				throw new Error('No valid coordinates');
			}
			function containsNumber(coordinates) {
				if (coordinates.length > 1 && isNumber(coordinates[0]) && isNumber(coordinates[1])) {
					return true;
				}
		
				if (Array.isArray(coordinates[0]) && coordinates[0].length) {
					return containsNumber(coordinates[0]);
				}
				throw new Error('coordinates must only contain numbers');
			}
		
			function isNumber(num) {
				return !isNaN(num) && num !== null && !Array.isArray(num);
			}
		
			// Optional parameters
			options = options || {};
			if (typeof options !== 'object') throw new Error('options is invalid');
			var ignoreBoundary = options.ignoreBoundary;
		
			// validation
			if (!point) throw new Error('point is required');
			if (!polygon) throw new Error('polygon is required');
		
			var pt = getCoord(point);
			var polys = getCoords(polygon);
			var type = (polygon.geometry) ? polygon.geometry.type : polygon.type;
			var bbox = polygon.bbox;
		
			// Quick elimination if point is not inside bbox
			if (bbox && inBBox(pt, bbox) === false) return false;
		
			// normalize to multipolygon
			if (type === 'Polygon') polys = [polys];
		
			for (var i = 0, insidePoly = false; i < polys.length && !insidePoly; i++) {
				// check if it is in the outer ring first
				if (inRing(pt, polys[i][0], ignoreBoundary)) {
					var inHole = false;
					var k = 1;
					// check for the point in any of the holes
					while (k < polys[i].length && !inHole) {
						if (inRing(pt, polys[i][k], !ignoreBoundary)) {
							inHole = true;
						}
						k++;
					}
					if (!inHole) insidePoly = true;
				}
			}
			return insidePoly;
		}
	}; // γεωμετρία
};
//
