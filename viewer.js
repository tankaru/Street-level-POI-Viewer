let node_latlon;
let node_ca;

let overpassjson = [];
let specialjson = [];
let wikipediajson = [];
/*
json = [{
	type:
	name:
	lat:
	lon:
	osm_id:
	text:
	url:
	tags:{}
	distance:
}]

*/

let map;
let viewer;
let viewer_marker;

let viewer_route;
let map_route;
let map_marker;

const R = 6378100;	
const height = 2.2;
const client_id = 'NEh3V0ZjaE1fT1Nkdk9jMnJlSGNQQTowYjljOTA5MWI0N2EzOTBh';
const ors_client_id = '5b3ce3597851110001cf6248e7943784fb51427ebaafda20404a762e';
const url_key = 'Streetlevel POI viewer, URL';

initMap();
initViewer();

function saveUrl() {
	const url = location.href;
	localStorage.setItem(url_key, url);
}

function loadUrl(){
	const url = localStorage.getItem(url_key);
	console.log("URL loaded: ", url);
	return url;
}


function initViewer(){
	var tagKey = 'S0x2iwuJnH2Gj8ONzhvcrQ';

	viewer = new Mapillary.Viewer(
		"mly",
		client_id,
		null,
		{
			component: {
				cover: false,
				tag: true,
				popup: true,
				marker:true,
			},
		}
	);
	
	viewer.setFilter(["==", "fullPano", true]);


	viewer.on(Mapillary.Viewer.nodechanged, function(node) {
		
		node_latlon = node.latLon;
		node_ca = node.ca;
		
		viewer_marker.setLatLng([node_latlon.lat, node_latlon.lon]);

		console.log("nodechanged");
		redrawNodes();
		//drawGrid();

		map.panTo(node_latlon);


	});
	viewer.on(Mapillary.Viewer.povchanged, function(node) {

		viewer.getPointOfView().then((pov) => {
			viewer_marker.setRotationAngle(pov.bearing);
		});
		
	});	
	window.addEventListener("resize", function() { viewer.resize(); });

	//move to map center
	moveToCenter();

}

function moveToCenter(){
	const center = map.getCenter();

	const url = `https://a.mapillary.com/v3/images?client_id=${client_id}&closeto=${center.lng},${center.lat}&pano=true&radius=200&per_page=1`;
	
	let request = new XMLHttpRequest();
	request.open('GET', url , true);
	request.onload = function () {
	
		data = this.response;

		const json = JSON.parse(data);

		if (json.features.length < 1){
			alert("No 360 photo here");
			return;
		}
		const key = json.features[0].properties.key;

		viewer.moveToKey(key);

	}
	request.send();


}


function redrawNodes(){
	viewer.getComponent("tag").removeAll();
	viewer.getComponent("popup").removeAll();
	if (overpassjson.length>0){
		drawOSMdata(overpassjson);
	}
	if (specialjson.length>0){
		drawSpecialNode(specialjson);
	}
	if (wikipediajson.length>0){
		drawWikipediaNodes(wikipediajson);
	}	
}

function openButton(){
	const key = document.getElementById("photokey").value;
	viewer.moveToKey(key);
}

function normalizeLon(lon){
	return ((lon + 180) % 360 + 360 ) % 360 - 180;
}

function storeOverpass(key_string){
	const lat = node_latlon.lat;
	const lon = node_latlon.lon;
	
	const radius = 50; //m
	const search_area = `(around:${radius},${lat},${lon})`;

	
	const date_string = document.getElementById("osm_data_date").value;
	let date_query_string="";
	if (date_string != ""){
		date_query_string = `[date:"${date_string}T00:00:00Z"]`;
	}
	

	const query =
	`[out:json]${date_query_string};
	(
		node[${key_string}]${search_area};
		way[${key_string}]${search_area};
		relation[${key_string}]${search_area};
	);
	out center;`;


	const encoded_query = encodeURI(query);
	
	const url = 'https://overpass-api.de/api/interpreter?data=' + encoded_query;


	console.log(url);
	let request = new XMLHttpRequest();
	request.open('GET', url , true);
	request.onload = function () {
	
		const data = JSON.parse(this.response);

		console.log("storeOverpass: ", JSON.stringify(data, null, 2));
		
		//データが入っていなかったらダメ
		if (data.elements.length < 1) {
			alert("No data");
			return;
		}
		

		overpassjson = convertNodesWaysToNodes(data.elements);
		for (let i=0; i<overpassjson.length; i++){
			overpassjson[i].text = tag2Img(overpassjson[i].tags) + overpassjson[i].tags.name;
			overpassjson[i].url = `https://www.openstreetmap.org/${overpassjson[i].type}/${overpassjson[i].id}`;
		}
		redrawNodes();
		drawOSMdata(overpassjson)
		//drawGrid();

	}
	request.send();

}

function buttonOverpassName(){
	
	const osm_name = document.getElementById("osm_name").value;

	const overpass_search_string = `"name"~"${osm_name}",i`;
	console.log(overpass_search_string);
	storeOverpass(overpass_search_string);
	
}

function buttonOverpassKey(){

	const osm_keys = document.getElementById('osm_keys');
	const key = osm_keys[osm_keys.selectedIndex].value;

	storeOverpass(key);
	
}

function tag2Img(tags){
	for (let key in tags){
		if (key == "amenity" || key == "shop" || key == "tourism" || key == "leisure" || key == "historic"){
			return `<img src="maki/${tags[key]}-15.svg" alt="" />`;
		}
	}
	return "";
}

function convertNodesWaysToNodes(jsons){

	//nodeを集める
	let nodes = [];
	for (let i = 0; i<jsons.length; i++){
		const item = jsons[i];
		if (item.type == "node"){
			nodes.push(item);
		}
	}

	let node_objects = [];


	//wayの座標を平均化して1点に
	let ways = [];
	for (let i = 0; i<jsons.length; i++){
		const item = jsons[i];
		if (item.type == "way" || item.type == "relation"){
			let way = item;
/*
			let lat_sum = 0;
			let lon_sum = 0;
			let node_count = 0;
			for (let j = 0; j < way.nodes.length ;j++){
				const target = nodes.find((node) => {return (node.id == way.nodes[j])});
				lat_sum += target.lat;
				lon_sum += target.lon;
				node_count++;

			}
			const lat_av = lat_sum/node_count;
			const lon_av = lon_sum/node_count;
*/
			way.lat = item.center.lat;
			way.lon = item.center.lon;

			ways.push(way);

		}
	}
	const all_objects = nodes.concat(ways);
	let named_objects = [];
	for (let i=0; i<all_objects.length; i++){
		const item = all_objects[i];
		if(item.tags){
			if(item.tags.name){
				named_objects.push(item);
			}
		}
	}

	return named_objects;
}

function drawWikipediaNodes(json){
	addWikipediaNodes(json);
}

function drawOSMdata(json){
	
	addNodes(json);

}


function getWaysDividedByZeroLine(way_xys){
	
	let way1=[];
	let way2 = [];
	
	let divided_segment = false;
	
	way1.push(way_xys[0]);
	for (let i=0; i < way_xys.length-1; i++){
		const x0 = way_xys[i][0];
		const x1 = way_xys[i+1][0];
		if (Math.abs(x0-x1)>0.5){
			divided_segment = !divided_segment;
		}
		if (!divided_segment){
			way1.push(way_xys[i+1]);	
		} else {
			way2.push(way_xys[i+1]);
		}
		
	}
	return way1;//, way2];
}

function getClosedWayNodes(way_nodes){
	let closedway_nodes = way_nodes;
	const nlen = way_nodes.length; 
	for (let j=0; j < nlen; j++) {
		const item = way_nodes[nlen-1-j];
		closedway_nodes.push(item);
	}			
	return closedway_nodes;
}

function addNodes(nodes){
	const popupComponent = viewer.getComponent('popup');


	//xy座標系に変換
	let node_xys = [];
	for (let j = 0; j < nodes.length; j++){	
		const xy = getXY(node_latlon, nodes[j], height, node_ca);
		node_xys.push(xy);
	}
	//カメラからの距離でソート
	node_xys.sort((a,b) => {
		if (a.distance > b.distance) return -1;
		if (a.distance < b.distance) return 1;
		return 0;
	});
	let popup_number = 0;
	for (let j = 0; j < node_xys.length; j++){
		//ポップアップを作成
		let xy = node_xys[j];

		const div = document.createElement('div');
		if (xy.osm.tags.name){
			xy.osm.distance = node_xys[j].distance;
			xy.osm.name = xy.osm.tags.name;
			div.innerHTML = divContent(xy.osm, "amenity");
			div.className = "tooltip1";
			//遠い店舗は文字を小さく
			const fontsize = Math.min(14, Math.round(12*25/xy.distance));
			div.style.fontSize = fontsize + "pt";
			div.style.padding = "2";
			const popup = new Mapillary.PopupComponent.Popup();
			popup.setDOMContent(div);
			//遠い店舗は上のほうに表示
			popup.setBasicPoint([xy.x, xy.y - 0.05*(xy.distance/50)]);
			popupComponent.add([popup]);
			popup_number++;

		}
	}
	if (popup_number < 1) alert("No named objects");


	
	window.addEventListener("resize", function() { viewer.resize(); });
}


function addWikipediaNodes(nodes){
	const popupComponent = viewer.getComponent('popup');


	//xy座標系に変換
	let node_xys = [];
	for (let j = 0; j < nodes.length; j++){	
		const xy = getXY(node_latlon, nodes[j], height, node_ca);
		node_xys.push(xy);
	}
	//カメラからの距離でソート
	node_xys.sort((a,b) => {
		if (a.distance > b.distance) return -1;
		if (a.distance < b.distance) return 1;
		return 0;
	});

	for (let j = 0; j < node_xys.length; j++){
		//ポップアップを作成
		let xy = Object.create(node_xys[j]);
		const div = document.createElement('div');




		const text = wikipadiaLabel(xy.osm.name, xy.osm.img, xy.distance);
		xy.osm.text = text;
		xy.osm.distance = xy.distance;

		div.innerHTML = divContent(xy.osm,"wikipedia");
		div.className = "tooltip1";
		//遠い店舗は文字を小さく
		const fontsize = Math.min(14, Math.round(12*1000/2/xy.distance));
		div.style.fontSize = fontsize + "pt";
		div.style.padding = "2";
		const popup = new Mapillary.PopupComponent.Popup();
		popup.setDOMContent(div);
		//遠い店舗は上のほうに表示
		popup.setBasicPoint([xy.x, -0.1 +  xy.y - 0.05*(xy.distance/1000)]);
		popupComponent.add([popup]);

	}


	
	window.addEventListener("resize", function() { viewer.resize(); });
}


function divContent(json, pclass = ""){
	let content = "";
	let tooltip = "";
	let tags = "";

	if (json.tags){
		tags = json.tags;
		tooltip = tooltipContent(tags);
	}
	let showroute = "";
	if (Number(json.distance) < 2000){
		showroute = `<input type="button" onclick="showRoute(${json.lat},${json.lon}, '${escape(json.name)}');" value="Route to ${json.name}">`;
	}

	content = `<p class="${pclass}"><a target="_blank" href="${json.url}">${json.text}</a><br/></p>
		<div class="description1">${tooltip}${showroute}</div>`;

	return content;

}

function tooltipContent(tags){

	let tooltip_content = JSON.stringify(tags, null, 1);

	tooltip_content = tooltip_content.replace(/[{}"]/g, '').replace(/,/g, '').replace(/^\n/g,'');
	return tooltip_content;
}

function showRoute(lat, lon, escaped_name){
	const name = unescape(escaped_name);
	//alert(name + ", " + lat + ", " + lon);

	let request = new XMLHttpRequest();

	request.open('POST', "https://api.openrouteservice.org/v2/directions/foot-walking/geojson");

	request.setRequestHeader('Accept', 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8');
	request.setRequestHeader('Content-Type', 'application/json');
	request.setRequestHeader('Authorization', ors_client_id);

	request.onreadystatechange = function () {
		if (this.readyState === 4) {
			console.log('Status:', this.status);
			console.log('Headers:', this.getAllResponseHeaders());
			console.log('Body:', this.responseText);

			if (this.status != 200){
				alert("Routing error");
			}

			const geojsonFeature = JSON.parse(this.responseText);
			showRouteOnMap(geojsonFeature,name);
			showRouteOnViewer(geojsonFeature, name);
			//console.log(JSON.stringify(response, null, 2));
			//const coordinates = geojsonFeature.features[0].geometry.coordinates;
			//console.log(coordinates);

		}
	};

	const start = [Number(node_latlon.lon), Number(node_latlon.lat)];
	const goal = [Number(lon), Number(lat)];
	const body = `{"coordinates":[${JSON.stringify(start)},${JSON.stringify(goal)}]}`;


	request.send(body);

}

function showRouteOnMap(geojsonFeature, name){
	map_route.clearLayers();


	map_route = L.geoJSON(geojsonFeature).addTo(map);
	map_marker.setTooltipContent(name);
	const coordinates = geojsonFeature.features[0].geometry.coordinates;

	map_marker.setLatLng([coordinates[coordinates.length-1][1],coordinates[coordinates.length-1][0]]);
}

function showRouteOnViewer(geojsonFeature, name){
	const coordinates = geojsonFeature.features[0].geometry.coordinates;
	const navigationPoints = dividePoints(coordinates, 3);	

	//add markers as a path on mapillary viewer
	let markers = [];
	for (i=0; i<navigationPoints.length-1; i++){
		let marker = new Mapillary.MarkerComponent.CircleMarker(
			i.toString(),
			{lat: navigationPoints[i][1], lon: navigationPoints[i][0]},
			{

				color: 0x0000FF,
				opacity: 0.6,

				radius: 0.5,
			}
		);
		markers.push(marker);
	}

	let markerComponent = viewer.getComponent('marker');
	markerComponent.removeAll();
	markerComponent.add(markers);
	markerComponent.on(
		Mapillary.MarkerComponent.MarkerComponent.changed,
		function(e) {
			console.log('Marker changed:', e.marker.id, e.marker.latLon);
		}
	);
}
function earthDistance(point1, point2) {
	return hubeny(point1[1], point1[0], point2[1], point2[0]);
}

function dividePoints(points, distance) {
	let dividedPoints = [];
	for (let i = 0; i < points.length - 1; i++) {
		const section_length = earthDistance(points[i], points[i + 1]);
		const dlat = points[i + 1][1] - points[i][1];
		const dlon = points[i + 1][0] - points[i][0];
		const ddlat = dlat * distance / section_length;
		const ddlon = dlon * distance / section_length;

		let dist = 0;
		let j = 0;
		dividedPoints.push(points[i])
		while (true) {
			dist += distance;
			if (dist > section_length) break;
			j++;
			dividedPoints.push([points[i][0] + j * ddlon, points[i][1] + j * ddlat]);
		}

	}
	return dividedPoints;
}
//
/*
function addWays(ways, nodes, color, width, name){
		//-----
	let way_polygons = [];

	for (let i=0; i<ways.length; i++){

		//ウェイの座標データを作成
		let way = ways[i];
		let way_latlons = [];
		for (let j = 0; j < way.nodes.length ;j++){
			const target = nodes.find((node) => {return (node.id == way.nodes[j])});
			way_latlons.push({lat:target.lat, lon:target.lon, node_id: target.id});
		}

		way_latlons = getDetailedLatlons(way_latlons, 10);
		//ウェイのxyデータを作成
		let way_xys = [];
		for (let j = 0; j < way_latlons.length; j++){
			const xy = getXY(node_latlon, way_latlons[j], height, node_ca);
			way_xys.push([xy.x, xy.y]);
		}
		//way_xys.push(way_xys[0]);

		way_xys = getWaysDividedByZeroLine(way_xys);

		const polygonGeometry = new Mapillary.TagComponent.PolygonGeometry(way_xys);
			const polygonTag = new Mapillary.TagComponent.OutlineTag(name + i, polygonGeometry, {lineColor: color, lineWidth: width, text: name + i});
			way_polygons.push(polygonTag);


	}				

	
	var tagComponent = viewer.getComponent("tag");
	//tagComponent.add(pointTags);
	tagComponent.add(way_polygons);				
	window.addEventListener("resize", function() { viewer.resize(); });
}
*/

//ウェイデータの描画がスムーズになるように細かく分割
/*
function getDetailedLatlons(latlons, count){
	
	let detailed_latlons = [];
	
	for (let i = 0; i < latlons.length-1; i++){
		const lat0 = latlons[i].lat;
		const lat1 = latlons[i+1].lat;
		const lon0 = latlons[i].lon;
		const lon1 = latlons[i+1].lon;
		
		for (let j = 0; j < count; j++){
			const lat = lat0 + (lat1 - lat0)/count*j;
			const lon = lon0 + (lon1 - lon0)/count*j;
			detailed_latlons.push({lat: lat, lon: lon});
		}
		
	}
	detailed_latlons.push(latlons[latlons.length-1]);
	
	return detailed_latlons;
}
*/

function getDlat(distance){
	return Math.atan(distance/R) * 180 / Math.PI;
}

function getDlon(distance, lat){
	const rr = R * Math.cos(lat / 180 * Math.PI);
	return Math.atan(distance/rr) * 180 / Math.PI;
}

function getXY(base, target, height, bearing){
	
	const dlat = target.lat - base.lat;
	const dlon = target.lon - base.lon;
	

	
	const dy = R * Math.sin(dlat /180 * Math.PI);
	const dx = R * Math.cos(base.lat / 180 * Math.PI) * Math.sin(dlon / 180 * Math.PI);
	
	let target_bearing = Math.atan(dx/dy) * 180 / Math.PI;
	if (dy < 0) {target_bearing += 180;}
	
	const relative_bearing = target_bearing - bearing;
	
	const distance = Math.pow(dx**2+dy**2,0.5);
	
	const target_angle = Math.atan(height/distance) * 180 / Math.PI;
	
	const theta = target_angle;
	const phi = relative_bearing;
	
	const x = (((phi + 180) + 360) % 360)/360;
	const y = 0.5 + theta/90*0.5;
	
	return {x:x, y:y, distance:distance, osm: target};

	
}

function closeLine(line){

	let newline = line;
	for (let i=0;i<line.length; i++){
		newline.push(line[line.length - i]);
	}
	return newline;
}



function drawGrid(){
	const tagComponent = viewer.getComponent("tag");
	//2m間隔グリッドを作る
	const dlat = getDlat(2);
	const dlon = getDlon(2, node_latlon.lat);
	
	let grids = [];
	let grid_id = 0;
	
	for (let i = -10; i < 11; i++){
		for (let j = -10; j < 11; j++){
			const xy = getXY(node_latlon, {lat:node_latlon.lat + dlat*j, lon:node_latlon.lon + dlon*i}, height, node_ca);
			let pointGeometry = new Mapillary.TagComponent.PointGeometry([xy.x, xy.y]);
			grids.push(new Mapillary.TagComponent.SpotTag('grid'+grid_id, pointGeometry, {}));
			grid_id++;

		}
	}
	

	tagComponent.add(grids);				
	window.addEventListener("resize", function() { viewer.resize(); });
}

function buttonWikipedia(){
	
	const url = `https://${getFilterLang()}.wikipedia.org/w/api.php?origin=*&format=json&action=query&generator=geosearch&prop=coordinates%7Cpageimages&ggscoord=${node_latlon.lat}%7C${node_latlon.lon}&ggsradius=1000&ggslimit=10`;
	console.log(url);			

	let request = new XMLHttpRequest();

	request.open('GET', url , true);

	request.onload = function () {
	
		data = this.response;

		const json = JSON.parse(data);

		console.log(JSON.stringify(json, null, 2));

		//queryが入っていなかったらダメ
		let query = json.query;
		if (!query) {
			alert("No data");
			return;
		}



		let elements = [];

		for (const key in json.query.pages){


			const item = json.query.pages[key];
			const name = item.title;
			const lat = item.coordinates[0].lat;
			const lon = item.coordinates[0].lon;

			const [distance, phi] = getDistancePhi(node_latlon, {lat:lat, lon:lon});

			let img = "wikipedia.png";
			if (item.thumbnail) {if (item.thumbnail.source){img = item.thumbnail.source;}};

			const text = wikipadiaLabel(name, img, distance);

			const element = {type:"node",name:name, img:img, lat:lat, lon:lon, text: text, url: `https://${getFilterLang()}.wikipedia.org/wiki/${name}`, tags: {}};
			elements.push(element);

		}
		wikipediajson = elements;

		drawWikipediaNodes(wikipediajson);
		redrawNodes();

	}
	request.send();

}

function wikipadiaLabel(name, img, distance){
	return `<img class="thumbnail" src="${img}"><span class="label"> ${name}<br/>${Math.round(distance).toLocaleString()} m</span>`;
}

function buttonPOI(){
	const poi_string = document.getElementById("poi_string").value;

	if (poi_string){
		const encoded_query = encodeURI(poi_string);

		const url = `https://${getFilterLang()}.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=coordinates&titles=${encoded_query}`;
		console.log(url);			
		let request = new XMLHttpRequest();

		request.open('GET', url , true);
		//request.setRequestHeader("Origin", "*");
		request.onload = function () {
		
			data = this.response;
			json = JSON.parse(data);

			console.log(JSON.stringify(json, null, 2));


			const pages = json.query.pages;
			const page = Object.keys(pages)[0];
			const name = pages[page].title;

			//座標がなかったらダメ
			if (!pages[page].coordinates) {
				alert("No data");
				return;
			}

			const coordinates = pages[page].coordinates[0];



			const [distance, phi] = getDistancePhi(node_latlon, {lat:coordinates.lat, lon:coordinates.lon});

			const element = {type:"node", lat:coordinates.lat, lon:coordinates.lon, text:`${name}<br/>${Math.round(distance).toLocaleString()} m`, url: `https://${getFilterLang()}.wikipedia.org/wiki/${name}`, tags: {}};
			specialjson = [element];

			drawSpecialNode(specialjson);
			redrawNodes();
			//drawGrid();
		}
		request.send();

	}
}

function getFilterLang(){
	let lang = "en";
	const filter_lang = document.getElementById("filter_lang").value;
	if (filter_lang){
		lang=filter_lang;
	}
	return lang;
}

function drawSpecialNode(json){


	const popupComponent = viewer.getComponent('popup');

	//nodeの平均値をとる
	let node_list = [];
	let lat_sum=0;
	let lon_sum=0;
	let node_count=0;
	const osm_elements = json;
	for (let i=0; i<osm_elements.length; i++){
		const item = osm_elements[i];
		if(item.type=="node"){
			node_list.push(item);
			node_count++;
			lat_sum += item.lat;
			lon_sum += item.lon;
		}
	}
	const lat_av = lat_sum/node_count;
	const lon_av = lon_sum/node_count;

	//nameを取得する
	let object = osm_elements[0];
	/*
	for (let i=0; i<osm_elements.length; i++){
		const item = osm_elements[i];
		if(item.tags){
			if(item.tags.name){

				object = item;

			}
		}
	}	
	*/

	const [distance, phi] = getDistancePhi(node_latlon, {lat:lat_av, lon:lon_av});
	const x = ((phi - node_ca + 180) % 360 + 360) /360;




	//ポップアップを作成

	const div = document.createElement('div');
		
	div.innerHTML = divContent(object,  "specialnode");

	div.className = "tooltip1";
	div.color = "#ff0000";
	const popup = new Mapillary.PopupComponent.Popup();
	popup.setDOMContent(div);
	//遠い店舗は上のほうに表示
	popup.setBasicPoint([x, 0.3]);
	popupComponent.add([popup]);

	window.addEventListener("resize", function() { viewer.resize(); });
}

function buttonCloseAll(){
	viewer.getComponent("tag").removeAll();
	viewer.getComponent("popup").removeAll();
	overpassjson = [];
	specialjson = [];
	wikipediajson = [];
}

//2点間の距離と方位角を計算
//https://keisan.casio.jp/exec/system/1257670779
function getDistancePhi(base, target){
	const x1 = rad(base.lon);
	const y1 = rad(base.lat);
	const x2 = rad(target.lon);
	const y2 = rad(target.lat);

	const dx = x2 - x1;

	const distance = R * Math.acos(Math.sin(y1)*Math.sin(y2) + Math.cos(y1)*Math.cos(y2)*Math.cos(dx));
	const phi = 90 - deg(Math.atan2( Math.cos(y1)*Math.tan(y2) - Math.sin(y1)*Math.cos(dx), Math.sin(dx)));

	return [distance, phi];
}

function rad(deg){
	return deg/180*Math.PI;
}

function deg(rad){
	return rad/Math.PI*180;
}

function initMap() {
//地図を表示するdiv要素のidを設定
	map = L.map('mapcontainer');

//表示するタイルレイヤのURLとAttributionコントロールの記述を設定して、地図に追加する
const osmLayer = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	attribution: "(C)<a href='https://www.openstreetmap.org/copyright' target='_blank'>OpenStreetMap contributors</a>",
	maxZoom: 21,
	maxNativeZoom: 19,
	minZoom: 1,
	//maxBounds: [[35.47, 139.62], [35.45, 139.64]],
}).addTo(map);
const kokudoLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',{
  attribution: '© <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
  maxZoom: 21,
  maxNativeZoom: 18,
  minZoom: 14,
  });
  
  const baseMap = {
	  "OpenStreetMap":osmLayer,
	  "国土地理院シームレス":kokudoLayer,
  };

  const mapillaryLayer = L.tileLayer('https://raster-tiles.mapillary.com/v0.1/{z}/{x}/{y}.png',{
	  attribution: '(C)<a href="https://www.mapillary.com/">Mapillary</a>, CC BY',
	maxZoom: 21,
	maxNativeZoom: 17,
  });
  mapillaryLayer.setOpacity(0.65);


	const overlayLayer = {
		"Mapillary":mapillaryLayer,

	}

  //レイヤ設定
  const layerControl = L.control.layers(baseMap,overlayLayer,{"collapsed":true,});
  layerControl.addTo(map);

  const sampleIcon = L.icon({
    iconUrl: 'icon.png',
    iconRetinaUrl: 'icon.png',
    iconSize: [50, 50],
    iconAnchor: [25, 25],
	popupAnchor: [25, -25],
	className: "marker_icon",
});

  viewer_marker = L.marker([0,0], { icon: sampleIcon, rotationAngle: 45, draggable: false }).addTo(map);
  map_route = L.geoJSON().addTo(map);
  map_marker = L.marker([0,0], {}).bindTooltip("").addTo(map);
  

  	
	var hash = new L.Hash(map);

	//URLに座標が付いていたらその場所を初期位置にする。
	const url = location.href;
	const match = url.match(/#(\d{1,2})\/(-?\d[0-9.]*)\/(-?\d[0-9.]*)/);
	//座標が付いていない場合は、前回開いたときのURLを開く
	const prev_url = loadUrl();
	let prev_match;
	if (prev_url) prev_match = prev_url.match(/#(\d{1,2})\/(-?\d[0-9.]*)\/(-?\d[0-9.]*)/);

	if (match){
		const [, zoom, lat, lon] = match;
		map.setView([lat, lon], zoom);
	} else if (prev_match){
		const [, zoom, lat, lon] = prev_match;
		map.setView([lat, lon], zoom);
	} else
	{
		map.setView([52.1564626, 5.389414243], 16);
	}
	
	//地図を移動したらその場所を保存
	map.on('moveend', function(e){
		saveUrl();
	});

}

function buttonGoCenter(){
	moveToCenter();

}

let enlarged = false;

function toggleMapSize(){
	if (enlarged){
		$('#mapcontainer').css('width', 300);
		$('#mapcontainer').css('height', 200);
		$('#button_map_size').attr('value', 'Enlarge map');
		enlarged = false;
	} else {
		$('#mapcontainer').css('width', $(window).width()*0.8);
		$('#mapcontainer').css('height', $(window).height()*0.8);
		$('#button_map_size').attr('value', 'Shrink map');
		enlarged = true;
	}

	map.invalidateSize();

}