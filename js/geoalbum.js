// GeoAlbum.js. Inspired by Tom MacWright's Big, partly based ON Weenote, written by Ilya Zverev. Licensed WTFPL.

/**
* Представляет карту, действующую в блоке
* @constructor
* @param {div} div - Блок для размещенеия карты.
* @param {LonLat} centerGeo - Координаты центра карты.
* @param {int} zoom - Условный масштаб.
* @param {int} minZ - мимнимальный условный масштаб.
* @param {int} maxZ - максимальный условный масштаб.
* @param {bool} controls - включать ли преключатель своёв.
*/
function mapDiv(div, centerGeo, provider, providerName, Z, controls) {
	this.div = div;
	this.map = L.map(div.getAttribute('id'), { keyboard: false });
	if (!isNaN(centerGeo[0]) && !isNaN(centerGeo[1]) && !isNaN(Z.ini))
		this.map.setView(centerGeo, Z.ini);
	else
		console.warn('map center ?');
	if (Z) {
		this.map.setMinZoom(Z.min);
		this.map.setMaxZoom(Z.max);
	}
	var a = Array.isArray(provider);
	var prov0 = (a ? provider[0] : provider);
	this.ini_layer = (typeof prov0 === 'string') ? L.tileLayer.provider(prov0) : prov0;
	this.ini_layer.addTo(this.map);
	if (controls) {
		this.Control = new L.Control.Layers();
		var n0 = providerName ? (Array.isArray(providerName) ? providerName[0] : providerName) : ((typeof prov0 === 'string') ? prov0 : '?');
		this.Control.addBaseLayer(this.ini_layer, n0);
		if (a) {
			for (var i in provider) {
				if (i != 0) {
					var prov = provider[i];
					var provStr = providerName[i] ? providerName[i] : ((typeof prov === 'string') ? prov : '?');
					this.Control.addBaseLayer((typeof prov === 'string') ? L.tileLayer.provider(prov) : prov, provStr);
				}
			}
		}
		this.map.addControl(this.Control);
	}
}

/**
* Представляет блок, имеющий геоеграфическое соответствие
* @constructor
* @param {div} div - Блок, имеющий геоеграфическое соответствие.
*/
function geoDiv(div, children) {
	this.div = div; // Блок гипертекста
	this.Geo = [NaN, NaN]; // Координаты центра
	this.Layer = null; // Графическое представление метки
	if (children)
		this.imageGeoDivs = [];
	else
		this.polyLayer = null;
}

/**
* Наличие верного географического соответствия
*/
geoDiv.prototype.NaNGeo = function () {
	return isNaN(this.Geo[0]) || isNaN(this.Geo[1]);
}

/**
* Представляет блок, содержащий серию местных географических описаний
* @constructor
* @param {div} geoAlbum_div - Блок, содержащий серию местных географических описаний.
*/
function geoAlbum(geoAlbum_div, options) {
	if (!navigator.onLine) {
		alert("🞮 💻⇿💻 Отсутствует подключение к сети, обновите при его появлении! ");
		return;
	}
	this.rootDiv = geoAlbum_div;
	this.content = null;
	this.geoDivs = [];
	this.geoDivIdx = null;

	this.options = options;
	this.groupMap = null;
	this.imageMap = null;
	this.block = false;
	this.locale = {
		prevText: '&larr; Предыдущее',
		nextText: 'Следующее &rarr;',
		// imIndices : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
		imIndices: 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЫ'
	};
	if (this.options.locale) {
		var l = this.options.locale;
		for (a in l) {
			if (l[a])
				this.locale[a] = l[a];
		}
	}

	if (this.options.contur) {
		var c = this.options.contur;
		this.OSM_rel_data = {			
			main_rel_style: {
				color: c.color ? c.color : '#00AAAA',
				weight: c.subAreas ? 5 : 3,
				opacity: 0.9,
				dashArray: '',
				radius: 0,
				fill: true,
				fillColor: '#00FFFF',
				fillOpacity: 0.05
			},
			main_rel_title: c.title ? c.title : "Основной контур",
			main_rel: {
				id: c.osm_relation_id,
				level: 0,
				mainRel: true,
				type: 'relation'
			},
			subAreas: {
				// Элементы границ внутренних территорий
				level_max: c.subAreasLevelMax ? c.subAreasLevelMax : 3,
				Layers: [],
				n_req: 0,
				style: {
					color: c.subAreasColor ? c.subAreasColor : '#AA0000',
					weight: 2,
					opacity: 0.7,
					dashArray: '',
					radius: 0,
					fillColor: '#FF0',
					fillOpacity: 0
				},
				data: []
			}
		};
	}
	this.imagePolygonStyle = {
		color: '#ff9900',
		weight: 3,
		opacity: 0.7,
		dashArray: '',
		radius: 0
	};

	this.OSM_req_i = 0;
	this.EXIF_req_i = 0;
	this.processRootDiv();

	this.rootDiv.innerHTML = '<div name="content"></div><div name="maps"><div name="overviewmap"></div><div name="detailmap"></div></div>';
	this.content = this.rootDiv.querySelector('div[name="content"]');
	this.content.appendChild(document.createComment(''));
	this.sync_geoMatrix(); // Если собраны все точки
}

geoAlbum.prototype.text_Im = function (div) {
	if (typeof this.options.functionImgH == 'function') {
		try {
			return this.options.functionImgH(div);
		} catch {
			return null;
		}
	}
	return null;
}

geoAlbum.prototype.text_Gr = function (div) {
	if (typeof this.options.functionGrH == 'function') {
		try {
			return this.options.functionGrH(div);
		} catch {
			return null;
		}
	}
	return null;
}

geoAlbum.prototype.processRootDiv = function () {
	// Обработка элементов групп иллюстраций - занесение в массив
	var iGrDiv = [];
	var a = this.rootDiv.childNodes;
	for (var divChRD, cRD = 0; cRD < a.length; cRD++) {
		ChRD = a[cRD];
		if (ChRD.nodeType == 1 && ChRD.localName != 'script') {
			var ImgArr = this.indexImgGeoDiv(ChRD);
			var geoImgGr = (ImgArr.length > 0);
			this.geoDivs.push(new geoDiv(ChRD, geoImgGr)); // this.processImg(ChRD);
			if (geoImgGr) {
				for (var iImDiv in ImgArr) {
					this.processImageDiv(ChRD.childNodes[ImgArr[iImDiv]], iImDiv);
				}
			}
		}
	}

	for (var i_gr in this.geoDivs) {
		this.processGroupDiv(this.geoDivs[i_gr].div, Number(i_gr));
	}
}

geoAlbum.prototype.indexImgGeoDiv = function (div) {
	if (div.nodeType != 1)
		return [];
	var iImgDiv = [];
	var divChGD = div.childNodes;
	for (var cGD = 0; cGD < divChGD.length; cGD++) {
		if (divChGD[cGD].nodeType == 1 && this.isGeoImageDiv(divChGD[cGD]))
			iImgDiv.push(cGD);
	}
	return iImgDiv;
}

geoAlbum.prototype.isGeoImageDiv = function (div) {
	if (div.getElementsByTagName('img').length == 0)
		return false;
	if (this.options.exif_geo)
		return true;
	for (var dt in geoAlb_lib.geoImageDivTags) {
		if (div.hasAttribute(geoAlb_lib.geoImageDivTags[dt]))
			return true;
	}
	return false;
}

geoAlbum.prototype.navEl = function (type, cl, text, i_gr) {
	var nav = document.createElement(type);
	nav.className = cl;
	nav.innerHTML = text;
	nav.GA = this;
	nav.geoDivIdx = i_gr;
	nav.onclick = function () {
		this.GA.focusGroup(this.geoDivIdx)
	};
	return nav;
}

geoAlbum.prototype.processGroupDiv = function (div, i_gr) {	// Добавляются вперёд - назад сссылки
	var a = document.createElement('a');
	a.href = '#' + this.rootDiv.id + "-" + Number(i_gr + 1);
	div.insertBefore(a, div.firstChild);
	var tr = this.navEl('p', "navright", this.locale.nextText, i_gr + 1);
	var br = this.navEl('p', "navright", this.locale.nextText, i_gr + 1);
	var tl = this.navEl('p', "navleft", this.locale.prevText, i_gr - 1);
	var bl = this.navEl('p', "navleft", this.locale.prevText, i_gr - 1);
	var navt = document.createElement('div');
	navt.className = "nav";
	var navb = document.createElement('div');
	navb.className = "nav";
	if (i_gr > 0) {
		navt.appendChild(tl);
		navb.appendChild(bl);
	}
	if (i_gr < this.geoDivs.length - 1) {
		navt.appendChild(tr);
		navb.appendChild(br);
	}
	div.appendChild(navb);
	div.insertBefore(navt, div.firstChild);
}

geoAlbum.prototype.LonLatGeoLayer = function (i_gr, i_im, geoPoint, req) {
	var matrixEl = this.geoDivs[i_gr].imageGeoDivs[i_im];
	matrixEl.Geo = geoPoint;
	var lt = L.letterMarker(geoPoint, req.letter, 'passiveImage');
	var text = this.text_Im(matrixEl.div);
	if (text)
		this.imgGeoLayer(lt, text);
	lt.options.req = req;
	matrixEl.Layer = lt;
}

geoAlbum.prototype.indexImg = function (i_im) {
	return (typeof this.locale.imIndices[i_im] != 'undefined') ? this.locale.imIndices[i_im] : i_im;
}

geoAlbum.prototype.processImageDiv = function (div, i_im) {
	var i_gr = this.geoDivs.length - 1;
	this.geoDivs[i_gr].imageGeoDivs.push(new geoDiv(div, false));
	var n_im = this.geoDivs[i_gr].imageGeoDivs.length - 1;
	if (div.getElementsByTagName('img').length > 0 /*|| div.hasAttribute('panoramio_id')*/) { // есть графический материал
		div.className = 'div-p ' + div.className;
		div.style.overflowX = 'auto';
		// Разбор секций картинок
		var req = {
			i_gr: i_gr,
			i_im: n_im,
			div: div,
			letter: this.indexImg(i_im)
		};

		this.markDiv(req);

		var n_tg = -1;
		for (var i_tg in geoAlb_lib.osm_tag) {
			if (div.hasAttribute(geoAlb_lib.osm_tag[i_tg])) {
				n_tg = i_tg;
			}
		}
		if (n_tg != -1) {
			req.id = Number(div.getAttribute(geoAlb_lib.osm_tag[n_tg]));
			req.type = geoAlb_lib.osm_type[n_tg];
			this.OSM_req_i++;
			geoAlb_lib.OSM_layer_request(req, this);
		} else if (div.hasAttribute('lat') && div.hasAttribute('lon')) {
			var geoPoint = [parseFloat(div.getAttribute('lat')), parseFloat(div.getAttribute('lon'))];
			this.LonLatGeoLayer(i_gr, i_im, geoPoint, req);
		} else if (div.hasAttribute('coordinates')) {
			var c = JSON.parse(div.getAttribute('coordinates'));
			if (c && c[0] && c[1]) {
				var geoPoint = [parseFloat(c[1]), parseFloat(c[0])];
				this.LonLatGeoLayer(i_gr, i_im, geoPoint, req);
			}
		} else if (this.options.exif_geo) {
			var img = div.getElementsByTagName('img')[0];
			this.EXIF_req_i++;
			console.log('exif req: ' + img.src + ' = > ' + req.i_gr + ' ' + req.i_im + ' ');
			var exif_obj = new Exif(img.src, {
				ignored: [],
				req: req,
				GA: this,
				done: function (exif_obj) {
					function dec(a) {
						return a[0] + a[1] / 60.0 + a[2] / 3600.0;
					}
					var req = this.options.req;
					try {
						if (typeof exif_obj.GPSLatitude != 'undefined' && typeof exif_obj.GPSLongitude != 'undefined') {
							var lat = dec(exif_obj.GPSLatitude);
							var lon = dec(exif_obj.GPSLongitude);
							var geoPoint = [lat, lon];
							this.options.GA.LonLatGeoLayer(req.i_gr, req.i_im, geoPoint, req);
							console.log('exif: ' + req.i_gr + ' ' + req.i_im + ' ');
						} else
							console.log('exif: Z ' + req.i_gr + ' ' + req.i_im + ' ');
					}
					catch
					{
						console.log('exif: X ' + req.i_gr + ' ' + req.i_im + ' ');
					}
					finally {
						this.options.GA.EXIF_req_i--;
						if (this.options.GA.EXIF_req_i == 0)
							this.options.GA.sync_geoMatrix(); // Если собраны все точки
					}
				}
			});
		}
	}
}

// Добавляет индексную подпись к иллюстрации
geoAlbum.prototype.markDiv = function (req) {
	var letterDiv = document.createElement('div');
	letterDiv.className = 'photoidx';
	letterDiv.appendChild(document.createTextNode(req.letter));
	letterDiv.GA = this;
	letterDiv.req = req;
	letterDiv.onclick = function () {
		this.GA.block = true;
		this.GA.focusImage(this.req.i_gr, this.req.i_im);
	};
	req.div.insertBefore(letterDiv, req.div.firstChild);
}

// Функции определения важных состояний готовности
geoAlbum.prototype.ok_main_rel = function () {
	return (!this.OSM_rel_data.main_rel.id) || (this.OSM_rel_data.main_rel.id && this.OSM_rel_data.main_rel.layer);
}
geoAlbum.prototype.ok_subAreas = function () {
	return (!this.options.contur) ? true : ((!this.options.contur.subAreas) || (this.options.contur.subAreas && this.OSM_rel_data.subAreas.n_req == 0));
}
geoAlbum.prototype.ok_geoMatrix = function () {
	return (this.OSM_req_i == 0 && this.EXIF_req_i == 0);
}

geoAlbum.__hash_register = {
	name: [],
	GA: []
};

// Событие сбора всех координат иллюстраций: готовность к отрисовке карт.
geoAlbum.prototype.sync_geoMatrix = function () {
	if (!this.ok_geoMatrix() || this._ok_geoMatrix)
		// Все запросы на координаты иллюстраций завершены
		return;
	this._ok_geoMatrix = true;

	for (var div0, cRD = 0; div0 = this.rootDiv.fitstChild;) {
		this.rootDiv.removeChild(div0);
	}

	// Усреднение координат внутри групп
	for (var i_gr in this.geoDivs) {
		if (typeof this.geoDivs[i_gr].imageGeoDivs == 'undefined')
			continue;
		var Geo = geoAlb_lib.avgGeoDivs(this.geoDivs[i_gr].imageGeoDivs);
		this.geoDivs[i_gr].Geo = Geo;
		var Mark = Number(i_gr) + 1;
		var MarkL = L.letterMarker(Geo, Mark, 'passiveGroup');
		if (typeof this.text_Gr == 'function') {
			var text = this.text_Gr(this.geoDivs[i_gr].div);
			if (text)
				MarkL.bindPopup(text);
		}
		MarkL.on(
			'click', function () {
				var o = this.options;
				o.GA.focusGroup(o.letter - 1);
			});
		MarkL.on(
			'mouseover', function (e) {
				this.openPopup();
			});
		MarkL.on(
			'mouseout', function (e) {
				this.closePopup();
			});
		this.geoDivs[i_gr].Layer = MarkL;
		this.geoDivs[i_gr].Layer.options.GA = this;

		for (var i_im in this.geoDivs[i_gr].imageGeoDivs) {
			try {
				var text = this.text_Im(this.geoDivs[i_gr].imageGeoDivs[i_im].div);
				if (text)
					this.geoDivs[i_gr].imageGeoDivs[i_im].Layer.bindPopup(text);
			} catch	{
			}
		}
	}

	// Усреднение координат между группами
	this.globalAvg = geoAlb_lib.avgGeoDivs(this.geoDivs);
	var mc = this.rootDiv.querySelector('div[name="overviewmap"]');
	var ms = new Date().getTime();
	mc.setAttribute('id', 'ov' + ms);
	this.groupMap = new mapDiv(
		mc,
		this.globalAvg,
		this.options.groupMapProvider ? this.options.groupMapProvider : 'OpenStreetMap.Mapnik',
		this.options.groupMapName ? this.options.groupMapName : 'ОСМ/Мапник',
		this.options.groupMapZ ? this.options.groupMapZ : { ini: 10, min: 1, max: 17 },
		false
	);

	// Отображаем на обзорную карту главный объект - обычно это отношение границ покрываемой области.
	if (this.OSM_rel_data.main_rel.id)
		geoAlb_lib.OSM_layer_request(this.OSM_rel_data.main_rel, this);

	if (geoAlbum.__hash_register.name.length == 0) {
		window.addEventListener('hashchange', function (event) {
			geoAlbum.hashChange();
		});
	}
	// Добавляем прослушивание для отлова внутренних адресов ссылок
	geoAlbum.__hash_register.name.push(this.rootDiv.id);
	geoAlbum.__hash_register.GA.push(this);

	this.sync_imageMap();
}

// Срабатывает при изменении адреса
geoAlbum.hashChange = function () {
	var urlh = decodeURI(location.hash);
	var ho = geoAlb_lib.deconstructHash(urlh);
	for (i_GA in geoAlbum.__hash_register.GA) {
		if (ho.name == geoAlbum.__hash_register.name[i_GA]) {
			var i_gr = ho.i_gr - 1;
			var GA = geoAlbum.__hash_register.GA[i_GA];
			var i_im = GA.indexImg(ho.code_im);
			if (!GA.block) { // Блокировка если адрес изменился по внутреннему вызову
				GA.focusImage(i_gr, i_im, true);
				if (i_im >= 0)
					GA.scrollImage(i_gr, i_im);
			} else
				GA.block = false;
			return true;
		}
	}
	return false;
}
// Установка обзорной карты
geoAlbum.prototype.sync_groupMap = function () {
	if (!(this.ok_geoMatrix() && this.ok_main_rel()))
		return;
	var OSMrd = this.OSM_rel_data;
	var mr = OSMrd.main_rel;
	if (mr.id && mr.layer) {
		this.groupMap.Control = new L.Control.Layers();
		this.groupMap.map.addLayer(mr.layer);
		this.groupMap.Control.addOverlay(mr.layer, OSMrd.main_rel_title);
	}
	for (var i_gr in this.geoDivs) {
		if (!this.geoDivs[i_gr].NaNGeo())
			this.groupMap.map.addLayer(this.geoDivs[i_gr].Layer);
	}

	// Заказ контуров подотношений
	if (this.options && this.options.contur && this.options.contur.subAreas)
		this.req_SubAreas(mr, 1);
	this.groupMap.map.addControl(this.groupMap.Control);
	this.groupMap.map.addLayer(mr.layer);
}

// Запрос на выдачу всех подчинённых отношений к данному
geoAlbum.prototype.req_SubAreas = function (rel_data){
	var osm_rl_id = geoAlb_lib.getSubAreas(rel_data.xml, rel_data.id);
	for (var i = 0; i < osm_rl_id.length; i++) {
		this.OSM_rel_data.subAreas.n_req++;
		var req = {
			subArea: true,
			type: 'relation',
			level: rel_data.level + 1,
			id: osm_rl_id[i],
			id_rel_req : rel_data.id
		}; // console.table(req);
		geoAlb_lib.OSM_layer_request(req, this);
	}
}

// Установка местной карты
geoAlbum.prototype.sync_imageMap = function () {
	if (!(this.ok_geoMatrix() && this.ok_main_rel() && this.ok_subAreas()))
		return;
	var dm = this.rootDiv.querySelector("[name=detailmap]")
	var ms = new Date().getTime();
	dm.setAttribute('id', 'dm' + ms);
	this.imageMap = new mapDiv(
		dm,
		this.globalAvg,
		this.options.imageMapProvider ? this.options.imageMapProvider : 'OpenStreetMap.Mapnik',
		this.options.imageMapName ? this.options.imageMapName : 'ОСМ/Мапник',
		this.options.imageMapZ ? this.options.imageMapZ : { ini: 15, min: 7, max: 21 },
		true
	);
	var OSMrd = this.OSM_rel_data;
	if (OSMrd.main_rel.id && OSMrd.main_rel.layer) {
		var xml = OSMrd.main_rel.xml;
		var mr = geoAlb_lib.osmRelationGeoJson(xml, OSMrd.main_rel.id);
		var gJs = L.geoJSON(mr, OSMrd.main_rel_style);
		gJs.bindPopup(OSMrd.main_rel_title);
		this.imageMap.Control.addOverlay(gJs, OSMrd.main_rel_title);
		this.imageMap.map.addLayer(gJs);
		if (this.options && this.options.contur && this.options.contur.subAreas) {
			for (var l in OSMrd.subAreas.Layers)
			{
				this.imageMap.Control.addOverlay(OSMrd.subAreas.Layers[l], OSMrd.main_rel_title + ': устройство (' + l +')');
				this.imageMap.map.addLayer(OSMrd.subAreas.Layers[l]);
			}
		}
	}

	if (typeof this.options.routeLayer != 'undefined' && this.options.routeLayer) { // Добавление местного слоя - нередко маршрута
		var rl = this.options.routeLayer;
		this.imageMap.Control.addOverlay(rl, (typeof rl._popupContent != 'undefined') ? rl._popupContent : 'Маршрут');
		rl.setStyle(this.options.routeStyle ? this.options.routeStyle : { color: '#8000ff', opacity: 0.95 });
		this.imageMap.map.addLayer(rl);
	}
	this.focusGroup(0, false);
	geoAlbum.hashChange();
	if (typeof (this.options.functionFinal) == 'function')
		this.options.functionFinal(this);
}

// При завершении загрузки главного контура
geoAlbum.prototype.mainRelationOk = function (data) {
	var mr = this.OSM_rel_data.main_rel;
	for (var i in data)
	{
		mr[i] = data[i];
	}	
	var ot = this.OSM_rel_data.main_rel_title;
	var title = ot ? ot : geoAlb_lib.getOsmTag(mr.xml, 'relation', mr.id, 'name');
	mr.layer.bindPopup(title);
	mr.layer.setStyle(this.OSM_rel_data.main_rel_style);
	this.sync_groupMap();
	this.sync_imageMap();
};

// При завершении загрузки подчинённого контура
geoAlbum.prototype.subAreaRelationOk = function (data) {	
	var sa_name = geoAlb_lib.getOsmTag(data.xml, 'relation', data.id, 'name');
	if (!sa_name)
		sa_name = geoAlb_lib.getOsmTag(data.xml, 'relation', data.id, 'description');
	data.layer.bindPopup(sa_name);
	var gss = this.OSM_rel_data.subAreas;
	data.layer.setStyle(gss.style);
	if (! gss.Layers[data.level])
		gss.Layers[data.level] = L.layerGroup();
	gss.Layers[data.level].addLayer(data.layer);
	gss.data.push(data);
	if (gss.level_max > data.level)
		this.req_SubAreas(data);
	gss.n_req--;
	if (gss.n_req == 0)
		this.sync_imageMap();
};

// Смена выбранной группы иллюстраций
geoAlbum.prototype.focusGroup = function (i_gr, signal = true) {
	if (typeof i_gr == 'undefined')
		return false;
	var i = this.geoDivIdx;
	if (i == i_gr)
		return true;

	if (i_gr > this.geoDivs.length - 1 || i_gr < 0) {
		alert("Индекс группы " + (i_gr + 1) + " вне пределов!");
		return false;
	}
	var geoDiv0 = this.geoDivs[i];
	if (geoDiv0 && !geoDiv0.NaNGeo()) {
		geoDiv0.Layer.setGeoStatus('passiveGroup');
	}
	var geoDiv1 = this.geoDivs[i_gr];
	if (geoDiv1 && !geoDiv1.NaNGeo()) {
		geoDiv1.Layer.setGeoStatus('activeGroup');
		this.groupMap.map.panTo(geoDiv1.Geo);
	}
	this.content.replaceChild(this.geoDivs[i_gr].div, this.content.firstChild);
	this.content.scrollTo(0, 0);

	if (this.imageMap) {
		if (this.imageMap.Layer)
			this.imageMap.map.removeLayer(this.imageMap.Layer);
		this.imageMap.Layer = new L.LayerGroup();
		for (var i_im in this.geoDivs[i_gr].imageGeoDivs) {
			if (!this.geoDivs[i_gr].imageGeoDivs[i_im].NaNGeo()) {
				this.imageMap.Layer.addLayer(this.geoDivs[i_gr].imageGeoDivs[i_im].Layer);
				if (this.geoDivs[i_gr].imageGeoDivs[i_im].polyLayer != null)
					this.imageMap.Layer.addLayer(this.geoDivs[i_gr].imageGeoDivs[i_im].polyLayer);
			}
		}
		this.imageMap.map.addLayer(this.imageMap.Layer);
		if (!geoDiv1.NaNGeo())
			this.imageMap.map.panTo(geoDiv1.Geo);
	}
	this.rootDiv.querySelector("[name=detailmap]").style.visibility = (geoDiv1.NaNGeo()) ? 'hidden' : 'inherit';
	this.geoDivIdx = i_gr;
	if (signal)
		this.signal(this.geoDivIdx, null);
	return true;
}

// Активизация выбранной иллюстрации в текущей гуппе
geoAlbum.prototype.scrollImage = function (i_gr, i_im) {
	function getRelativePos(elm) {
		var pPos = elm.parentNode.getBoundingClientRect(), // parent pos
			cPos = elm.getBoundingClientRect(), // target pos
			pos = {};
		pos.top = cPos.top - pPos.top + elm.parentNode.scrollTop,
			pos.right = cPos.right - pPos.right,
			pos.bottom = cPos.bottom - pPos.bottom,
			pos.left = cPos.left - pPos.left;
		return pos;
	}
	// Установка смещения прокрутки
	if (this.geoDivIdx != i_gr)
		throw (new Exception("Не в группе!"));
	var im_div = this.geoDivs[i_gr].imageGeoDivs[i_im].div;

	var pos = getRelativePos(im_div);
	this.content.scrollTop = pos.top;
}

// Смена выбранной группы иллюстраций
geoAlbum.prototype.focusImage = function (i_gr, i_im, signal = true) {
	if (typeof i_im == 'undefined' || (!this.focusGroup(i_gr, false)) || i_im < 0)
		return;
	var Gr = this.geoDivs[i_gr];
	if (typeof Gr.imageGeoDivs == 'undefined' || i_im > Gr.imageGeoDivs.length - 1) {
		alert("Индекс иллюстрации " + this.indexImg(i_im) + " вне пределов группы № " + i_gr + " в " + this.rootDiv.id + " !");
		return;
	}
	for (var im in this.geoDivs[i_gr].imageGeoDivs) {
		this.geoDivs[i_gr].imageGeoDivs[im].Layer.setGeoStatus('passiveImage');//.setColor(this.options.passiveImageColor ? this.options.passiveImageColor : 'black');
	}

	this.imageMap.map.panTo(Gr.imageGeoDivs[i_im].Geo);
	this.geoDivs[i_gr].imageGeoDivs[i_im].Layer.setGeoStatus('activeImage');//.setColor(this.options.activeImageColor ? this.options.activeImageColor : 'red');
	if (signal) {
		this.signal(i_gr, i_im);
	}
}

geoAlbum.prototype.imgGeoLayer = function (layer, popup) {
	layer.on('click', function () {
		var o = this.options;
		o.GA.focusImage(o.req.i_gr, o.req.i_im);
		o.GA.scrollImage(o.req.i_gr, o.req.i_im);
	}
	);
	layer.on('mouseover', function (e) {
		this.openPopup();
	}
	);
	layer.on('mouseout', function (e) {
		this.closePopup();
	}
	);
	layer.bindPopup(popup);
	layer.options.GA = this;
}

geoAlbum.prototype.OSM_layer_include = function (xhr) {	
	var data = xhr.req_par;
	data.xml = xhr.responseXML;
	data.xhr = xhr;	
	if (data.mainRel || data.subArea)
	{			
		data.geoJSON = geoAlb_lib.osmRelationGeoJson(data.xml, data.id);
		data.layer = L.geoJSON(data.geoJSON);
	}
	if (data.mainRel) {
		this.mainRelationOk(data);
	} else if (data.subArea) {
		this.subAreaRelationOk(data);
	} else
		this.includeMatrixElement(data);
}

// Добавление асинхронно полученного слоя для географических координат иллюстрации
geoAlbum.prototype.includeMatrixElement = function (data) {
	var xml = data.xml;
	var req = data.xhr.req_par;
	geoAlb_lib.OSM_href(req.div, req.id, req.type);
	var elDiv = this.geoDivs[req.i_gr].imageGeoDivs[req.i_im];
	var name = geoAlb_lib.getOsmTag(xml, req.type, req.id, 'name');
	name = name ? name : geoAlb_lib.getOsmTag(xml, req.type, req.id, 'ref');
	if (req.type == "node") {
		elDiv.Geo = geoAlb_lib.OSM_node_geo(xml, req.id);
	} else { // rel, way
		var geoJson0 = osmtogeojson(xml);
		var polyStyle = this.imagePolygonStyle;
		polyStyle.color = req.div.hasAttribute('color') ? req.div.getAttribute('color') : polyStyle.color;
		var polyLayer = L.geoJSON(geoAlb_lib.geoJsonRemoveOsmNodes(geoJson0), polyStyle);
		polyLayer.options.req = req;
		this.imgGeoLayer(polyLayer, req.letter + (name ? (" ⇒ " + name) : ""))
		elDiv.polyLayer = polyLayer;
		elDiv.Geo = geoAlb_lib.OSM_node_avg(xml);
	}
	var Geo = elDiv.Geo;
	var nLay = L.letterMarker(Geo, req.letter, 'passiveImage')
	nLay.options.req = req;
	elDiv.Layer = nLay;
	this.imgGeoLayer(nLay, req.letter + (name ? (" ⇒ " + name) : ""))
	this.OSM_req_i--;
	this.sync_geoMatrix();
}

// Смена фокуса
geoAlbum.prototype.signal = function (i_gr, i_im) {
	var add = ((i_im) ? ("-" + this.indexImg(i_im)) : "");
	location.hash = "#" + encodeURI(this.rootDiv.id + "-" + (i_gr + 1) + add);
	//  alert (location.hash);
}

/**
* Класс специализированных меток в кружочке
* @constructor настраивает координаты, знак, цвета и пр.
*/
L.LetterMarker = L.Marker.extend({
	options: {
		letter: 'A',
		color: 'black',
		riseOnHover: true,
		icon: new L.DivIcon({ popupAnchor: [2, -2] })
	},

	initialize: function (latlng, letter, geostatus, options) {
		L.Marker.prototype.initialize.call(this, latlng, options);
		this.options.letter = letter;
		this.options.geostatus = geostatus;
	},

	_initIcon: function () {
		var options = this.options,
			map = this._map,
			animation = (map.options.zoomAnimation && map.options.markerZoomAnimation),
			classToAdd = animation ? 'leaflet-zoom-animated' : 'leaflet-zoom-hide';

		if (!this._icon) {
			var div = document.createElement('div');
			div.innerHTML = '' + options.letter + '';
			div.className = 'leaflet-marker-icon';
			div.setAttribute('geo', '1');
			div.setAttribute('geostatus', options.geostatus);
			this._icon = div;

			if (options.title) {
				this._icon.title = options.title;
			}

			this._initInteraction();

			L.DomUtil.addClass(this._icon, classToAdd);

			/*			if (options.riseOnHover){
							L.DomEvent
								.on(this._icon, 'mouseover', this._bringToFront, this)
								.on(this._icon, 'mouseout', this._resetZIndex, this);
						}*/
		}

		var panes = this._map._panes;
		panes.markerPane.appendChild(this._icon);
	},

	setColor: function (color) {
		if (!this._icon)
			this.options.color = color;
		else
			this._icon.style.backgroundColor = color;
	},
	setGeoStatus: function (status) {
		if (this._icon)
			this._icon.setAttribute('geostatus', status);
	},
});
/**
* Класс специализированных меток в кружочке
* @initialize настраивает координаты, знак, цвета и пр.
* @param {LonLat} latlng - Координаты метки.
* @param {string} letter - Знак.
* @param {object} options - настройки
*/
L.letterMarker = function (latlng, letter, geostatus, options) {
	return new L.LetterMarker(latlng, letter, geostatus, options);
}

/**
* Библиотека статических функций - специализированных операций
* @constructor --
*/
geoAlb_lib = {};

// Три типа ОСМ объектов - теги для разбора, части адреса, необходимость выборки внутренностей и название
geoAlb_lib.osm_tag = ['osm_nd_id', 'osm_w_id', 'osm_rl_id'];
geoAlb_lib.osm_type = ['node', 'way', 'relation'];
geoAlb_lib.osm_suff = ['', 'full', 'full'];
geoAlb_lib.osm_title = ['Точка', 'Линия', 'Отношение'];
// Теги, определяющие, что графический блок имеет географические координаты
geoAlb_lib.geoImageDivTags = ['lon', 'lat', ...geoAlb_lib.osm_tag, 'coordinates', 'flickr_id'/*, 'panoramio_id'*/];

geoAlb_lib.OSM_baseURL = 'https://www.openstreetmap.org'; // Хранилище ОСМ данных здесь
geoAlb_lib.OSM_API_URL = geoAlb_lib.OSM_baseURL + '/api/0.6/' //Выборка объектов отсюда;

// Формирует одрес ОСМ объекта
geoAlb_lib.OSM_URL = function (type, id, suff) {
	var _smod = (suff != '') ? '/' + suff : '';
	return geoAlb_lib.OSM_API_URL + type + '/' + id + _smod;
}

// Разбор внутренней ссылки на странице
geoAlb_lib.deconstructHash = function (hash) {
	var el = hash.split('#')[1];
	if (!el)
		return { name: null, i_gr: null, code_im: null };
	var name = el.split('-')[0];
	var i_gr = el.split('-')[1];
	var code_im = el.split('-')[2];
	return { name: name, i_gr: i_gr, code_im: code_im };
}

// Асинхронное получение файла
geoAlb_lib.OSM_layer_request = function (req_par, GA) {
	var i = geoAlb_lib.osm_type.indexOf(req_par.type);
	var url = geoAlb_lib.OSM_URL(req_par.type, req_par.id, geoAlb_lib.osm_suff[i]);
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
	}
}

// Выбирает широту и долготу из XML узла единстственной точки в формате OSM
geoAlb_lib.OSM_xml_node_geo = function (OSM_node) {
	return [parseFloat(OSM_node.getAttribute('lat')), parseFloat(OSM_node.getAttribute('lon'))];
}

// Вычисляет среднее геометрическое массива координат
geoAlb_lib.Geo_avg = function (Geo) {
	if (Geo.length == 1)
		return Geo[0];
	var lat = []; var lon = [];
	for (var i in Geo) {
		if (Geo[i] != null) {
			lat.push(Geo[i][0]);
			lon.push(Geo[i][1]);
		}
	}
	var minlat = Math.min.apply(null, lat);
	var maxlat = Math.max.apply(null, lat);
	var avg_lat = (minlat + maxlat) / 2;
	var minlon = Math.min.apply(null, lon);
	var maxlon = Math.max.apply(null, lon);
	var avg_lon = (minlon + maxlon) / 2;
	return [avg_lat, avg_lon];
};

// Усреднение в массиве geoDiv
geoAlb_lib.avgGeoDivs = function (a) {
	var Geo = [];
	for (var i in a) {
		if (!a[i].NaNGeo()) {
			Geo.push(a[i].Geo);
		}
	}
	return geoAlb_lib.Geo_avg(Geo);
}

// Вычисляет среднее геометрическое точек из OSM XML документа
geoAlb_lib.OSM_node_avg = function (xml) {
	var Geo = [];
	var el = xml.getElementsByTagName('node');
	for (var i = 0; i < el.length; i++) {
		Geo.push([el[i].getAttribute('lat'),
		el[i].getAttribute('lon')]);
	}
	return geoAlb_lib.Geo_avg(Geo);
};

// По коду точки в OSM возвращает объект с широтой и долготой.
geoAlb_lib.OSM_node_geo = function (xml, id, latlon = true) {
	var nodes = xml.getElementsByTagName('node');
	var nd = {};
	for (var i = 0; i < nodes.length; i++) {
		if (nodes[i].getAttribute('id') == id)
			nd = nodes[i];
	}
	if (!nd)
		return null;
	var osmg = geoAlb_lib.OSM_xml_node_geo(nd);
	if (latlon)
		return osmg;
	return [osmg[1], osmg[0]];
};

// Удаляет точки из geoJSON отношения или линии
geoAlb_lib.geoJsonRemoveOsmNodes = function (geoJson) {

	for (var i = 0; i < geoJson.features.length; i++) {
		if (geoJson.features[i].geometry.type == 'Point') {
			geoJson.features.splice(i, 1);
			i--;
		}
	}
	return geoJson;
};

// Получает из документа ветвь отношения с данным кодом
geoAlb_lib.getRelationXmlTree = function (xml, osm_rl_id) {
	var relations = xml.getElementsByTagName('relation');
	for (var i = 0; i < relations.length; i++) {
		if (relations[i].getAttribute('id') == osm_rl_id)
			return relations[i];
	}
	return null;
};

// Получает массив номеров отношений, содержащих подчинённые территории
geoAlb_lib.getSubAreas = function (xml, osm_rl_id) {
	var relXml = geoAlb_lib.getRelationXmlTree(xml, osm_rl_id);
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
geoAlb_lib.geoJsonDecomposeSubAreas = function (geoJson, osm_rl_id) {
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
geoAlb_lib.relationSelfPolygon = function (geoJson, osm_rl_id) {
	for (var i = 0; i < geoJson.features.length; i++) {
		if ((geoJson.features[i].geometry.type.indexOf('Polygon') + 1) &&
			(geoJson.features[i].id == 'relation/' + osm_rl_id))
			return i;
	}
	return null;
};

// Получить значение данного тега
geoAlb_lib.getOsmTag = function (xml, type, osm_id, tag) {
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
geoAlb_lib.osmRelationGeoJson = function (xml, rel_id) {
	var geoJson0 = osmtogeojson(xml);
	var geoJson1 = geoAlb_lib.geoJsonRemoveOsmNodes(geoJson0);
	var geoJson2 = geoAlb_lib.geoJsonDecomposeSubAreas(geoJson1, rel_id);
	geoJson2.osm_rel_id = rel_id;
	return geoJson2;
};

// Добавляет ссылку на объявленные в свойствах объекты OSM после последнего элемента секции.
geoAlb_lib.OSM_href = function (div, id, type) {
	var e = document.createElement('br');
	div.appendChild(e);
	var e = document.createElement('a');
	e.href = geoAlb_lib.OSM_baseURL + '/' + type + '/' + id;
	var i = geoAlb_lib.osm_type.indexOf(type);
	e.appendChild(document.createTextNode(geoAlb_lib.osm_title[i] + ' OSM'));
	div.appendChild(e);
	div.appendChild(document.createTextNode(' '));
	var e = document.createElement('a');
	e.href = geoAlb_lib.OSM_URL(type, id, geoAlb_lib.osm_suff[i]);
	e.appendChild(document.createTextNode('Координаты с OSM в XML'));
	div.appendChild(e);
	return e.href;
};
/* КОНЕЦ БИБЛИОТЕКИ */
