// GeoAlbum.js. Inspired by Tom MacWright's Big, partly based ON Weenote, written by Ilya Zverev. Licensed WTFPL.

/**
* Представляет карту, действующую в блоке
* @constructor
* @param {div} div - Блок для размещенеия карты.
* @param {LonLat} center_φλ - Координаты центра карты.
* @param {int} zoom - Условный масштаб.
* @param {int} minZ - мимнимальный условный масштаб.
* @param {int} maxZ - максимальный условный масштаб.
* @param {bool} controls - включать ли преключатель своёв.
*/
function mapDiv(div, center_φλ, provider, providerName, Z, controls) {
	this.div = div;
	this.map = L.map(div.getAttribute('id'), { keyboard: false });
	if (!isNaN(center_φλ[0]) && !isNaN(center_φλ[1]) && !isNaN(Z.ini))
		this.map.setView(center_φλ, Z.ini);
	else
		console.warn('map center ?');
	if (Z) {
		this.map.setMinZoom(Z.min);
		this.map.setMaxZoom(Z.max);
	}
	var a = Array.isArray(provider);
	var prov0 = (a ? provider[0] : provider);
	this.ini_layer = (typeof prov0 == 'string') ? L.tileLayer.provider(prov0) : prov0;
	this.ini_layer.addTo(this.map);
	if (controls) {
		this.Control = new L.Control.Layers();
		var n0 = providerName ? (Array.isArray(providerName) ? providerName[0] : providerName) : ((typeof prov0 == 'string') ? prov0 : '?');
		this.Control.addBaseLayer(this.ini_layer, n0);
		if (a) {
			for (var i in provider) {
				if (i != 0) {
					var prov = provider[i];
					var provStr = providerName[i] ? providerName[i] : ((typeof prov == 'string') ? prov : '?');
					this.Control.addBaseLayer((typeof prov == 'string') ? L.tileLayer.provider(prov) : prov, provStr);
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
	this.φλ = [NaN, NaN]; // Координаты центра
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
	return isNaN(this.φλ[0]) || isNaN(this.φλ[1]);
};

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
	this.OSM_req_i = 0; // Счётчик запросов в ОСМ
	this.EXIF_req_i = 0; // Счётчик запросов для получения EXIF
	this.options = options;
	this.OsmGDlib = new OsmGeoDocLib();

	// Расстановка событий загрузки изображения
	var img_el = geoAlbum_div.getElementsByTagName('img');
	this.img = {
		s: [],
		N: img_el.length,
		Ok: 0
	};
	for (let img of img_el) {
		img.GA_ = this;
		img.addEventListener('loadend', geoAlbum.imgIncrement, false);
		this.img.s.push(img);
	}
	this.baseDivs = {
		content: document.createElement('div'),
		maps: document.createElement('div'),
		overviewmap: document.createElement('div'),
		detailmap: document.createElement('div'),
		_root: geoAlbum_div
	};
	for (var i in this.baseDivs) // Именование необходимо для стилизации
		this.baseDivs[i].setAttribute('name', i);
	this.baseDivs.maps.appendChild(this.baseDivs.overviewmap);
	this.baseDivs.maps.appendChild(this.baseDivs.detailmap); // Картографическая часть из двух блоков

	this.rootDiv = geoAlbum_div;
	this.geoDivs = [];
	this.geoDivIdx = null;

	this.groupMap = null;
	this.imageMap = null;
	this.block = false;
	this.modifRoot = false; // Была ли подмена внутренностей
	this.locale = {
		prevText: '&larr; Предыдущее',
		nextText: 'Следующее &rarr;',
		// imIndices : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
		imIndices: 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЫ'
	};
	if (this.options.locale) {
		var l = this.options.locale;
		for (var a in l) {
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
	if (!this.options.exif_geo)
		this.parseRootDiv();
}

geoAlbum.prototype.parseRootDiv = function () {	
    if (this.modifRoot)
    {
	    console.warn('Неверный вызов разбора');
    	return;
    }
	this.baseDivs.content.appendChild(document.createComment('')); // Пустое наполнение для последующей подмены
	this.processRootDiv(this.baseDivs._root);
	this.modifyRootDiv();
	console.log('root div ✓');
	this.init_geoMatrix(); // Если собраны все точки
};

geoAlbum.prototype.modifyRootDiv = function (){ // Подмена места размещения альбома тремя панелями с двумя картами	
	var b = this.rootDiv;
	while (b.firstChild) {
		b.removeChild(b.firstChild);
	}	
	b.appendChild(this.baseDivs.content);	
	b.appendChild(this.baseDivs.maps);
	this.modifRoot = true;
};

geoAlbum.prototype.text_Im = function (div) { // Текст к элементу альбома
	if (typeof this.options.functionImgH == 'function') {
		try {
			return this.options.functionImgH(div);
		} catch (e){
			return null;
		}
	}
	return null;
};

geoAlbum.prototype.text_Gr = function (div) { // Текст к группе элементов альбома
	if (typeof this.options.functionGrH == 'function') {
		try {
			return this.options.functionGrH(div);
		} catch (e) {
			return null;
		}
	}
	return null;
};

geoAlbum.prototype.processRootDiv = function (div) {
	// Обработка элементов групп иллюстраций - занесение в массив	
	var a = div.childNodes;
	for (var cRD = 0; cRD < a.length; cRD++) {
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
};

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
	for (var dt in this.OsmGDlib.geoImageDivTags) {
		if (div.hasAttribute(this.OsmGDlib.geoImageDivTags[dt]))
			return true;
	}
	return false;
};

geoAlbum.prototype.navEl = function (type, cl, text, i_gr) {
	var nav = document.createElement(type);
	nav.className = cl;
	nav.innerHTML = text;
	nav.GA = this;
	nav.geoDivIdx = i_gr;
	nav.onclick = function () {
		this.GA.focusGroup(this.geoDivIdx);
	};
	return nav;
};

geoAlbum.prototype.processGroupDiv = function (div, i_gr) {	// Добавляются вперёд - назад сссылки
	var a = document.createElement('a');
	a.href = '#' + this.baseDivs._root.id + "-" + Number(i_gr + 1);
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
};

// Добавление слоя с отображенеим точки изображения
geoAlbum.prototype.φλLayer = function (i_gr, i_im, φλ, req, φλ1) {
	var matrixEl = this.geoDivs[i_gr].imageGeoDivs[i_im];
	matrixEl.φλ = φλ;
	var lt = L.letterMarker(φλ, req.letter, 'passiveImage');
	if (φλ1) {
		var lin_exif = L.polyline([φλ, φλ1], { color: '#FF0000', width: 2 });
		lin_exif.bindTooltip(req.letter);
		lin_exif.on('mouseover', function (e) {
			e.target.getTooltip().setLatLng(e.latlng);
		});
		matrixEl.polyLayer = lin_exif;
	}
	var text = (typeof req.exif_obj == 'undefined') ? this.text_Im(matrixEl.div) : '';
	this.imgφλLayer(lt, text);
	lt.options.req = req;
	matrixEl.Layer = lt;
};
// Поиск символа для индекса
geoAlbum.prototype.indexImg = function (i_im) {
	return (typeof this.locale.imIndices[i_im] != 'undefined') ? this.locale.imIndices[i_im] : i_im;
};
// Обратный поиск индекса для символа
geoAlbum.prototype.indexImgRev = function (code_im) {
	if (typeof this.locale.imIndices == 'undefined')
		return code_im;
	for (var s in this.locale.imIndices) {
		if (this.locale.imIndices[s] == code_im)
			return s;
	}
	return code_im;
};

geoAlbum.exif_ok = function (exif_obj) {	
	var req = this.options.req;
	req.exif_obj = exif_obj;
	var gA = this.options.GA;
	gA.exif_ok(exif_obj, req, this.options.img);
};

geoAlbum.prototype.exif_ok = function(exif_obj, req, img){
	function dec(a, x) {
		return (a[0] + a[1] / 60.0 + a[2] / 3600.0) * ((x == "W" || x == "S") ? -1 : 1);
	}
	var lit = '✓';
	try {
		if (typeof exif_obj.GPSLatitude != 'undefined' && typeof exif_obj.GPSLongitude != 'undefined') {
		    var oe = this.options.exif;
			var φ = dec(exif_obj.GPSLatitude, exif_obj.GPSLatitudeRef);
			var λ = dec(exif_obj.GPSLongitude, exif_obj.GPSLongitudeRef);
			var φλ1 = null;
			if (typeof exif_obj.GPSDestLatitude != 'undefined' && typeof exif_obj.GPSDestLongitude != 'undefined') {
				var φ1 = dec(exif_obj.GPSDestLatitude, exif_obj.GPSDestLatitudeRef);
				var λ1 = dec(exif_obj.GPSDestLongitude, exif_obj.GPSDestLongitudeRef);
				φλ1 = [φ1, λ1];
			}			
			if (typeof exif_obj.DateTimeOriginal != 'undefined' && oe && oe.DateTimeOriginal) {
				var p = document.createElement('p');
				p.className = 'exif_date';
				p.innerText = exif_obj.DateTimeOriginal;
				img.parentNode.insertBefore(p, img.nextSibling);
			}
			if (typeof exif_obj.Artist != 'undefined' && oe && oe.Artist) {
				var p = document.createElement('p');
				p.className = 'exif_author';
				p.innerText = this.options.locale.exif_Artist + ' : ' + exif_obj.Artist;
				img.parentNode.insertBefore(p, img.nextSibling);
			}
			if (typeof exif_obj.UserComment != 'undefined' && oe && oe.Title) {
				var p = document.createElement('p');
				p.className = 'exif_title';
				p.innerText = this.exif_title(exif_obj.UserComment);
				img.parentNode.insertBefore(p, img.nextSibling);
			}
			this.φλLayer(req.i_gr, req.i_im, [φ, λ], req, φλ1); // console.log('φ , λ ' + φ + ' ' + λ );
		} else
			lit = '[φ,λ]=∅';
	}
	catch (e)
	{
		lit = '✘';
	}
	finally {
		this.EXIF_req_i--;
		console.log( '(' + this.EXIF_req_i + ')' + ' exif <- [' + req.i_gr + ' ' + req.i_im + '] ' + lit );
		if (this.EXIF_req_i == 0){
			console.log('exif ✓');
			this.init_geoMatrix(); // Если собраны все точки
		}
	}
};

geoAlbum.prototype.exif_title = function (UserComment){
	return UserComment;
	/*ASCII (hex 41, 53, 43, 49, 49, 00, 00, 00): ITU-T T.50 IA5
JIS (hex 4A, 49, 53, 00, 00, 00, 00, 00): JIS X208-1990
Unicode (hex 55, 4E, 49, 43, 4F, 44, 45, 00): Unicode Standard */
};

geoAlbum.prototype.processImageDiv = function (div, i_im) {
	var i_gr = this.geoDivs.length - 1;
	this.geoDivs[i_gr].imageGeoDivs.push(new geoDiv(div, false));
	var n_im = this.geoDivs[i_gr].imageGeoDivs.length - 1;
	if (!div.getElementsByTagName('img').length > 0 /*|| div.hasAttribute('panoramio_id')*/) { // нет графического материала
		console.log("0 img");
		return;
	}

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

	var osm_tag_i = null;
	for (var i_tg in this.OsmGDlib.osm_tag) {
		if (div.hasAttribute(this.OsmGDlib.osm_tag[i_tg])) {
			osm_tag_i = i_tg;
		}
	}
	if (osm_tag_i != null) {
		req.id = Number(div.getAttribute(this.OsmGDlib.osm_tag[osm_tag_i]));
		req.type = this.OsmGDlib.osm_type[osm_tag_i];
		this.OSM_req_i++;
		this.OsmGDlib.OSM_layer_request(req, this);
	} else if (div.hasAttribute('lat') && div.hasAttribute('lon')) {
		var φλ = [parseFloat(div.getAttribute('lat')), parseFloat(div.getAttribute('lon'))];
		this.φλLayer(i_gr, i_im, φλ, req);
	} else if (div.hasAttribute('φ') && div.hasAttribute('λ')) {
		var φλ = [parseFloat(div.getAttribute('φ')), parseFloat(div.getAttribute('λ'))];
		this.φλLayer(i_gr, i_im, φλ, req);
	} else if (div.hasAttribute('coordinates')) {
		var c = JSON.parse(div.getAttribute('coordinates'));
		if (c && c[0] && c[1]) {
			var φλ = [parseFloat(c[1]), parseFloat(c[0])];
			this.φλLayer(i_gr, i_im, φλ, req);
		}
	} else if (this.options.exif_geo) { // Проверяются метаданные изображения только если нет других
		var img = div.getElementsByTagName('img')[0];
		this.EXIF_req_i++;
		var a_adr = img.src.split('/');
		console.log( '(' + this.EXIF_req_i + ')' + ' exif -> [ ' + req.i_gr + ' ' + req.i_im + ' ] ' + a_adr[a_adr.length - 1] + ' ');
		var exif_obj = new Exif(img.src, {
			ignored: [],
			req: req,
			GA: this,
			img: img,
			done: geoAlbum.exif_ok
		});
	}
};

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
};

// Функции определения важных состояний готовности
geoAlbum.prototype.ok_main_rel = function () {
	return (!this.OSM_rel_data.main_rel.id) || (this.OSM_rel_data.main_rel.id && this.OSM_rel_data.main_rel.layer);
};
geoAlbum.prototype.ok_subAreas = function () {
	return (!this.options.contur) ? true : ((!this.options.contur.subAreas) || (this.options.contur.subAreas && this.OSM_rel_data.subAreas.n_req == 0));
};
geoAlbum.prototype.ok_geoMatrix = function () {
	return (this.modifRoot && this.OSM_req_i == 0 && this.EXIF_req_i == 0 && (!this.options.exif_geo || this.ok_imgLoad()));
};
geoAlbum.prototype.ok_imgLoad = function () {
	for (var i in this.img.s) {
		if ((this.img.s[i].width == 0) || (this.img.s[i].height == 0) || !this.img.s[i].complete)
			return false;
	}
	return true;
};

geoAlbum.__hash_register = {
	name: [],
	GA: []
};

// Событие сбора всех координат иллюстраций: готовность к отрисовке карт.
geoAlbum.prototype.init_geoMatrix = function () {
	if (!this.ok_geoMatrix() || this._ok_geoMatrix)
		// Все запросы на координаты иллюстраций завершены
		return;
	this._ok_geoMatrix = true;
	console.log('geoMatrix ✓');
/*while (this.rootDiv.firstChild){} // Все дочерние корневого убраны
	this.rootDiv.removeChild(this.rootDiv.firstChild);
}*/

	// Усреднение координат внутри групп
	for (var i_gr in this.geoDivs) {
		if (typeof this.geoDivs[i_gr].imageGeoDivs == 'undefined')
			continue;
		var φλ = this.OsmGDlib.avgGeoDivs(this.geoDivs[i_gr].imageGeoDivs);
		if (isNaN(φλ[0]) || isNaN(φλ[1]))
			continue;
		this.geoDivs[i_gr].φλ = φλ;		
		var Mark = Number(i_gr) + 1;
		var MarkL = L.letterMarker(φλ, Mark, 'passiveGroup');
		if (typeof this.text_Gr == 'function') {
			var text = this.text_Gr(this.geoDivs[i_gr].div);
			if (text)
				MarkL.bindTooltip(text);
		}
		MarkL.on('click', function () {
			var o = this.options;
			o.GA.focusGroup(o.letter - 1);
		});
		this.geoDivs[i_gr].Layer = MarkL;
		this.geoDivs[i_gr].Layer.options.GA = this;
		// Расставяются подписи внутри всех групп
		for (var i_im in this.geoDivs[i_gr].imageGeoDivs) {
			try {
				var text = this.text_Im(this.geoDivs[i_gr].imageGeoDivs[i_im].div);
				if (text)
					this.geoDivs[i_gr].imageGeoDivs[i_im].Layer.bindTooltip(text);
			} catch (e)	{
			}
		}
	}

	// Усреднение координат между группами
	var φλ = this.OsmGDlib.avgGeoDivs(this.geoDivs);	
	if (isNaN(φλ[0]) || isNaN(φλ[1])){
		alert ('В альбоме совсем нет никаких координат!');
		return;
	}
	this.baseDivs._root.φλ = φλ;
	var mc = this.baseDivs.overviewmap;
	var ms = new Date().getTime();
	mc.setAttribute('id', 'ov' + ms);
	this.groupMap = new mapDiv(
		mc,
		this.baseDivs._root.φλ,
		this.options.groupMapProvider ? this.options.groupMapProvider : 'OpenStreetMap.Mapnik',
		this.options.groupMapName ? this.options.groupMapName : 'ОСМ/Мапник',
		this.options.groupMapZ ? this.options.groupMapZ : { ini: 10, min: 1, max: 17 },
		false
	);

	// Отображаем на обзорную карту главный объект - обычно это отношение границ покрываемой области.
	if (this.OSM_rel_data.main_rel.id)
		this.OsmGDlib.OSM_layer_request(this.OSM_rel_data.main_rel, this);

	if (geoAlbum.__hash_register.name.length == 0) {
		window.addEventListener('hashchange', function (event) {
			geoAlbum.hashChange();
		});
	}
	// Добавляем прослушивание для отлова внутренних адресов ссылок
	geoAlbum.__hash_register.name.push(this.baseDivs._root.id);
	geoAlbum.__hash_register.GA.push(this);

	this.init_imageMap();
};

// Срабатывает при загрузке иллюстрации, если она не загружена до момента загрузки альбома
geoAlbum.imgIncrement = function () {
	this.GA_.imgIncrement();
};

geoAlbum.prototype.imgIncrement = function () {
	this.img.Ok++; // console.log('img ok : ' + this.img.Ok + ' N=' + this.img.N + ' ' + (this.img.Ok == this.img.N) + ' ' + this.ok_imgLoad());
	if ((this.img.Ok == this.img.N) && this.ok_imgLoad()) {
		console.log('img ✓ ' + this.img.Ok  + ' \\ ' + this.img.N);
		if (this.options.exif_geo)
			this.parseRootDiv();
		else
			geoAlbum.hashChange();
	}
};

// Разбор внутренней ссылки на странице
geoAlbum.deconstructHash = function (hash) {
		var el = hash.split('#')[1];
		if (!el)
			return { name: null, i_gr: null, code_im: null };
		var name = el.split('-')[0];
		var i_gr = el.split('-')[1];
		var code_im = el.split('-')[2];
		return { name: name, i_gr: i_gr, code_im: code_im };
	};

// Срабатывает при изменении адреса
geoAlbum.hashChange = function () {
	var urlh = decodeURI(location.hash);
	var ho = geoAlbum.deconstructHash(urlh);
	for (var i_GA in geoAlbum.__hash_register.GA) {
		if (ho.name == geoAlbum.__hash_register.name[i_GA]) {
			var i_gr = ho.i_gr - 1;
			var GA = geoAlbum.__hash_register.GA[i_GA];
			var i_im = GA.indexImgRev(ho.code_im);
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
};
// Установка обзорной карты
geoAlbum.prototype.init_groupMap = function () {
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
};

// Запрос на выдачу всех подчинённых отношений к данному
geoAlbum.prototype.req_SubAreas = function (rel_data) {
	var osm_rl_id = this.OsmGDlib.getSubAreas(rel_data.xml, rel_data.id);
	for (var i = 0; i < osm_rl_id.length; i++) {
		this.OSM_rel_data.subAreas.n_req++;
		var req = {
			subArea: true,
			type: 'relation',
			level: rel_data.level + 1,
			id: osm_rl_id[i],
			id_rel_req: rel_data.id
		}; // console.table(req);
		this.OsmGDlib.OSM_layer_request(req, this);
	}
};

// Установка местной карты
geoAlbum.prototype.init_imageMap = function () {
	if (!(this.ok_geoMatrix() && this.ok_main_rel() && this.ok_subAreas()))
		return;
	var dm = this.baseDivs.detailmap;
	var ms = new Date().getTime();
	dm.setAttribute('id', 'dm' + ms);
	this.imageMap = new mapDiv(
		dm,
		this.baseDivs._root.φλ,
		this.options.imageMapProvider ? this.options.imageMapProvider : 'OpenStreetMap.Mapnik',
		this.options.imageMapName ? this.options.imageMapName : 'ОСМ/Мапник',
		this.options.imageMapZ ? this.options.imageMapZ : { ini: 15, min: 7, max: 21 },
		true
	);
	var OSMrd = this.OSM_rel_data;
	if (OSMrd.main_rel.id && OSMrd.main_rel.layer) {
		var xml = OSMrd.main_rel.xml;
		var mr = this.OsmGDlib.osmRelationGeoJson(xml, OSMrd.main_rel.id);
		var gJs = L.geoJSON(mr, OSMrd.main_rel_style);
		gJs.bindPopup(OSMrd.main_rel_title);
		this.imageMap.Control.addOverlay(gJs, OSMrd.main_rel_title);
		this.imageMap.map.addLayer(gJs);
		if (this.options && this.options.contur && this.options.contur.subAreas) {
			for (var l in OSMrd.subAreas.Layers) {
				this.imageMap.Control.addOverlay(OSMrd.subAreas.Layers[l], OSMrd.main_rel_title + ': устройство (' + l + ')');
				this.imageMap.map.addLayer(OSMrd.subAreas.Layers[l]);
			}
		}
	}

	if (typeof this.options.routeLayer != 'undefined' && this.options.routeLayer) { // Добавление местного слоя - нередко маршрута
		var rl = this.options.routeLayer;
		rl.on('mouseover', function (e) {
			e.target.getTooltip().setLatLng(e.latlng);
		});
		this.imageMap.Control.addOverlay(rl, (typeof rl._tooltipContent != 'undefined') ? rl._tooltipContent : 'Маршрут');
		rl.setStyle(this.options.routeStyle ? this.options.routeStyle : { color: '#8000ff', opacity: 0.95 });
		this.imageMap.map.addLayer(rl);
	}
	this.focusGroup(0, false);
	geoAlbum.hashChange();
	if (typeof (this.options.functionFinal) == 'function')
		this.options.functionFinal(this);
};

// При завершении загрузки главного контура
geoAlbum.prototype.mainRelationOk = function (data) {
	var mr = this.OSM_rel_data.main_rel;
	for (var i in data) {
		mr[i] = data[i];
	}
	var ot = this.OSM_rel_data.main_rel_title;
	var title = ot ? ot : this.OsmGDlib.getOsmTag(mr.xml, 'relation', mr.id, 'name');
	mr.layer.bindPopup(title);
	mr.layer.setStyle(this.OSM_rel_data.main_rel_style);
	this.init_groupMap();
	this.init_imageMap();
};

// При завершении загрузки подчинённого контура
geoAlbum.prototype.subAreaRelationOk = function (data) {
	var sa_name = this.OsmGDlib.getOsmTag(data.xml, 'relation', data.id, 'name');
	if (!sa_name)
		sa_name = this.OsmGDlib.getOsmTag(data.xml, 'relation', data.id, 'description');
	data.layer.bindPopup(sa_name);
	var gss = this.OSM_rel_data.subAreas;
	data.layer.setStyle(gss.style);
	if (!gss.Layers[data.level])
		gss.Layers[data.level] = L.layerGroup();
	gss.Layers[data.level].addLayer(data.layer);
	gss.data.push(data);
	if (gss.level_max > data.level)
		this.req_SubAreas(data);
	gss.n_req--;
	if (gss.n_req == 0)
		this.init_imageMap();
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
                geoDiv0.Layer.setZIndexOffset(0);
	}
	var geoDiv1 = this.geoDivs[i_gr];
	if (geoDiv1 && !geoDiv1.NaNGeo()) {
		geoDiv1.Layer.setGeoStatus('activeGroup');
		geoDiv1.Layer.setZIndexOffset(40);
		this.groupMap.map.panTo(geoDiv1.φλ);
	}
	this.baseDivs.content.replaceChild(this.geoDivs[i_gr].div, this.baseDivs.content.firstChild);
	this.baseDivs.content.scrollTo(0, 0);

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
			this.imageMap.map.panTo(geoDiv1.φλ);
	}
	this.baseDivs.detailmap.style.visibility = (geoDiv1.NaNGeo()) ? 'hidden' : 'inherit';
	this.geoDivIdx = i_gr;
	if (signal)
		this.signal(this.geoDivIdx, null);
	return true;
};

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
	this.baseDivs.content.scrollTop = pos.top;
};

// Смена выбранной иллюстрации
geoAlbum.prototype.focusImage = function (i_gr, i_im, signal = true) {
	if (!this.focusGroup(i_gr, false))
		return;
	if (typeof i_im == 'undefined') {
		return;
	}
	if (i_im < 0)
		return;
	var Gr = this.geoDivs[i_gr];
	if (typeof Gr.imageGeoDivs == 'undefined' || i_im > Gr.imageGeoDivs.length - 1) {
		alert("Индекс иллюстрации " + this.indexImg(i_im) + " вне пределов группы № " + i_gr + " в " + this.baseDivs._root.id + " !");
		return;
	}
	var igd = this.geoDivs[i_gr].imageGeoDivs;
	for (var im in igd) {
		if (!igd[im].NaNGeo()) {
			igd[im].Layer.setGeoStatus('passiveImage');
                        igd[im].Layer.setZIndexOffset(0);
                    }
	}
	if (!igd[i_im].NaNGeo()) {
		igd[i_im].Layer.setGeoStatus('activeImage');
		igd[i_im].Layer.setZIndexOffset(40);
		this.imageMap.map.panTo(Gr.imageGeoDivs[i_im].φλ);
	}
	if (signal) {
		this.signal(i_gr, i_im);
	}
};

geoAlbum.prototype.imgφλLayer = function (layer, text) {
	layer.on('click', function () {
		var o = this.options;
		o.GA.focusImage(o.req.i_gr, o.req.i_im);
		o.GA.scrollImage(o.req.i_gr, o.req.i_im);
	});
	if (text)
		layer.bindTooltip(text);
	layer.options.GA = this;
};

geoAlbum.prototype.OSM_layer_include = function (xhr) {
	var data = xhr.req_par;
	data.xml = xhr.responseXML;
	data.xhr = xhr;
	if (data.mainRel || data.subArea) {
		data.geoJSON = this.OsmGDlib.osmRelationGeoJson(data.xml, data.id);
		data.layer = L.geoJSON(data.geoJSON);
	}
	if (data.mainRel) {
		this.mainRelationOk(data);
	} else if (data.subArea) {
		this.subAreaRelationOk(data);
	} else
		this.includeMatrixElement(data);
};

// Добавление асинхронно полученного слоя для географических координат иллюстрации
geoAlbum.prototype.includeMatrixElement = function (data) {
	var xml = data.xml;
	var req = data.xhr.req_par;
	this.OsmGDlib.OSM_href(req.div, req.id, req.type);
	var elDiv = this.geoDivs[req.i_gr].imageGeoDivs[req.i_im];
	var name = this.OsmGDlib.getOsmTag(xml, req.type, req.id, 'name');
	name = name ? name : this.OsmGDlib.getOsmTag(xml, req.type, req.id, 'ref');
	if (req.type == "node") {
		elDiv.φλ = this.OsmGDlib.OSM_node_geo(xml, req.id);
	} else { // OSM rel, way
		var geoJson0 = osmtogeojson(xml);
		var polyStyle = this.imagePolygonStyle;
		polyStyle.color = req.div.hasAttribute('color') ? req.div.getAttribute('color') : polyStyle.color;
		var polyLayer = L.geoJSON(this.OsmGDlib.geoJsonRemoveOsmNodes(geoJson0), polyStyle);
		polyLayer.options.req = req;
		this.imgφλLayer(polyLayer, req.letter + (name ? (" ⇒ " + name) : ""));
		elDiv.polyLayer = polyLayer;
		elDiv.φλ = this.OsmGDlib.OSM_node_avg(xml);
	}
	var φλ = elDiv.φλ;
	var nLay = L.letterMarker(φλ, req.letter, 'passiveImage');
	nLay.options.req = req;
	elDiv.Layer = nLay;
	this.imgφλLayer(nLay, req.letter + (name ? (" ⇒ " + name) : ""));
	this.OSM_req_i--;
	console.log('osm req 0');
	this.init_geoMatrix();
};

// Смена фокуса
geoAlbum.prototype.signal = function (i_gr, i_im) {
	var suffix = ((typeof i_im != 'undefined' && i_im != null) ? ("-" + this.indexImg(i_im)) : "");
	location.hash = "#" + encodeURI(this.baseDivs._root.id + "-" + (i_gr + 1) + suffix);
};

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

	initialize: function (φλ, letter, geostatus, options) {
		L.Marker.prototype.initialize.call(this, φλ, options);
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

			if (options.riseOnHover){
				L.DomEvent
					.on(this._icon, 'mouseover', this._bringToFront, this)
					.on(this._icon, 'mouseout', this._resetZIndex, this);
			}
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
	}
});
/**
* Класс специализированных меток в кружочке
* @initialize настраивает координаты, знак, цвета и пр.
* @param {LonLat} φλ - Координаты метки.
* @param {string} letter - Знак.
* @param {object} options - настройки
*/
L.letterMarker = function (φλ, letter, geostatus, options) {
	return new L.LetterMarker(φλ, letter, geostatus, options);
};

/* КОНЕЦ БИБЛИОТЕКИ */
