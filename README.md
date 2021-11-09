# геоАльбом
Географический альбом показывает карты с точками после того, как изменяет гипертекст, с элементами, содержащими географические координаты.

# geoAlbum
geographical album modificate HTML with coordinates to indicate maps

<a href="https://mkgrgis.github.io/geoAlbum_/%D0%9F%D0%B5%D0%B9%D0%B7%D0%B0%D0%B6%D0%BD%D1%8B%D0%B9%20%D0%BF%D0%B0%D1%80%D0%BA%20%D0%B2%20%D0%90%D0%BB%D1%83%D0%BA%D1%81%D0%BD%D0%B5.html"> Демонстрация / Demo </a>

Образец / Example
<img src="https://raw.githubusercontent.com/mkgrgis/geoAlbum/master/Demo.png"/>

From div with coordinates or OSM codes

```html
<pre>
<div>
	<h1>Павильон Александра I</h1>
	<p>Он же чайный павильон или утренний павильон</p>
	<p>Вид с озера</p>
	<div lat="57.42830702727808" lon="27.06228733062744" angle="nw"><a href="http://img.1188.lv/events/000/02/70/09/cc6dcc5ebcf0a5e8ef88dbb249851cab_600x420.jpg"><img src="http://img.1188.lv/events/000/02/70/09/cc6dcc5ebcf0a5e8ef88dbb249851cab_600x420.jpg"></a></div>
.....
	<div lat="57.42593882460705" lon="27.064910531044006" angle="nw"><a href="https://farm6.staticflickr.com/5742/30917920805_fa88c03330_c.jpg"><img src="https://farm6.staticflickr.com/5742/30917920805_fa88c03330_c.jpg"></a></div>
	<p>Монумент непонятного назначения</p>
	<div osm_nd_id="4347881899" angle="nw"><a href="https://farm6.staticflickr.com/5834/30283768264_86371a7fb3_c.jpg"><img src="https://farm6.staticflickr.com/5834/30283768264_86371a7fb3_c.jpg"></a></div>
</div>

<div>
	<h1>Мавзолей баронов Фитингофов - семейная усыпальница</h1>
	<p>Парадный фасад ротонды</p>
<div lat="57.42412502432083" lon="27.0682"><a href="http://www.aluksnespils.lv/uploads/page_image/bigImage-jpg/c82dc2e556444d536edd7d88f33a4733_253ddf53f00b0ad0a4e7d983bbd30a35.jpg"><img height="500px" src="http://www.aluksnespils.lv/uploads/page_image/bigImage-jpg/c82dc2e556444d536edd7d88f33a4733_253ddf53f00b0ad0a4e7d983bbd30a35.jpg"></a></div>
.....
```
</pre>
