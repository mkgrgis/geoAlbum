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
};
//
