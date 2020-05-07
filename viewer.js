let node_latlon;
let node_ca;
let overpassjson;
let specialjson;
let map;
let viewer;
let viewer_marker;

const R = 6378100;	
const height = 2.2;

initMap();
initViewer();


function initViewer(){
	var tagKey = 'S0x2iwuJnH2Gj8ONzhvcrQ';

	viewer = new Mapillary.Viewer(
		"mly",
		"NEh3V0ZjaE1fT1Nkdk9jMnJlSGNQQTowYjljOTA5MWI0N2EzOTBh",
		null,
		{
			component: {
				cover: false,
				tag: true,
				popup: true,
			},
		}
	);
	
	viewer.setFilter(["==", "fullPano", true]);


	viewer.on(Mapillary.Viewer.nodechanged, function(node) {
		
		node_latlon = node.latLon;
		node_ca = node.ca;
		
		viewer_marker.setLatLng([node_latlon.lat, node_latlon.lon]);

		console.log("nodechanged");
		viewer.getComponent("tag").removeAll();
		viewer.getComponent("popup").removeAll();
		if (overpassjson){
			drawOSMdata(overpassjson);
		}
		if (specialjson){
			drawSpecialNode(specialjson);
		}
		//drawGrid();

	});
	
	window.addEventListener("resize", function() { viewer.resize(); });

	//move to map center
	const center = map.getCenter();
	viewer.moveCloseTo(center.lat, center.lng);

}


function openButton(){
	const key = document.getElementById("photokey").value;
	viewer.moveToKey(key);
}

function getRoads(){
	
	const lat = node_latlon.lat;
	const lon = node_latlon.lon;
	
	const bbox_width = 100; //m
	const bbox_height = 100; //m
	
	
	const dlat = Math.asin(bbox_height/R) * 180 / Math.PI;
	const dlon = Math.asin(bbox_width/(R * Math.cos(lat * Math.PI / 180))) * 180 / Math.PI;
	
	
	
	const minlat = lat - dlat/2;
	const maxlat = lat + dlat/2;
	const minlon = lon - dlon/2;
	const maxlon = lon + dlon/2;
	
	const bbox = '(' + minlat + ',' + minlon + ',' + maxlat + ',' + maxlon + ')';
	
	const date_string = document.getElementById("osm_data_date").value;
	let date_query_string="";
	if (date_string != ""){
		date_query_string = `[date:"${date_string}T00:00:00Z"]`;
	}
	

	const query =
	`[out:json]${date_query_string};
	(
		node["amenity"]${bbox};
		node["shop"]${bbox};
	);
	(._;>;);
	out body;`;
	console.log(query);

	const encoded_query = encodeURI(query);
	
	const url = 'https://overpass-api.de/api/interpreter?data=' + encoded_query;
	
	let request = new XMLHttpRequest();
	request.open('GET', url , true);
	request.onload = function () {
	
		data = this.response;
		overpassjson = JSON.parse(data);
		drawOSMdata(overpassjson)
		//drawGrid();
	}
	request.send();


	
}

function drawOSMdata(json){




	//document.getElementById("data").innerText = JSON.stringify(json, null, 2);	
	
	const nodes_and_ways = json.elements;
	
	

	let pointTags = [];
	
	

	
	//ノードデータ格納
	let nodes = [];				
	for (let i=0; i<nodes_and_ways.length; i++){
		if (nodes_and_ways[i].type == "node") {
			nodes.push(nodes_and_ways[i]);
		}
	}
	//アメニティデータ格納
	let amenities = [];				
	for (let i=0; i<nodes_and_ways.length; i++){
		if (nodes_and_ways[i].type == "node" && nodes_and_ways[i].tags) {
			amenities.push(nodes_and_ways[i]);
		}
	}
	addNodes(amenities);

	//ビルウェイデータ格納
	let buildings = [];				
	for (let i=0; i<nodes_and_ways.length; i++){
		if (nodes_and_ways[i].type == "way" && nodes_and_ways[i].tags.building) {
			buildings.push(nodes_and_ways[i]);
		}
	};
	/*
	for (let i=0; i<buildings.length; i++){
		buildings[i].nodes = getClosedWayNodes(buildings[i].nodes.slice(0,buildings[i].nodes.length-2));
	}
	*/
	//addWays(buildings, nodes, 0x00FF00, 1, "building");

	//道路ウェイデータ格納
	let highways = [];				
	for (let i=0; i<nodes_and_ways.length; i++){
		if (nodes_and_ways[i].type == "way" && nodes_and_ways[i].tags.highway) {
			highways.push(nodes_and_ways[i]);
		}
	}

	for (let i=0; i<highways.length; i++){
		highways[i].nodes = getClosedWayNodes(highways[i].nodes);
	}

	//addWays(highways, nodes, 0x0000FF, 5, "highway");


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
	for (let j = 0; j < node_xys.length; j++){
		//ポップアップを作成
		const xy = node_xys[j];
		const div = document.createElement('div');
		if (xy.osm.tags.name){

			
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

		}
	}

	
	window.addEventListener("resize", function() { viewer.resize(); });
}

function divContent(osm, pclass = ""){
	let content;
	const tooltip = tooltipContent(osm);
	content = `<p class="${pclass}"><a target="_blank" href="https://www.openstreetmap.org/node/${osm.id}">${osm.tags.name}</a></p>
	<div class="description1">${tooltip}</div>`;
	return content;

}

function tooltipContent(osm){

	let tooltip_content = JSON.stringify(osm.tags, null, 1);

	tooltip_content = tooltip_content.replace(/[{}"]/g, '').replace(/,/g, '').replace(/^\n/g,'');
	return tooltip_content;
}

//
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

//ウェイデータの描画がスムーズになるように細かく分割
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

function openOSMButton(){
	const url = document.getElementById("osm_url").value;
	if (match = url.match(/www\.openstreetmap\.org\/([a-z]*)\/([0-9]*)/)) {
		const [, osm_type, osm_id] = match;
		
		const query = 
		`[out:json];
		(
			${osm_type}(${osm_id});
		);
		(._;>;);
		out body;`;

	const encoded_query = encodeURI(query);
	
	const url = 'https://overpass-api.de/api/interpreter?data=' + encoded_query;
	
	let request = new XMLHttpRequest();
	request.open('GET', url , true);
	request.onload = function () {
	
		data = this.response;
		specialjson = JSON.parse(data);
		drawSpecialNode(specialjson);
		//drawGrid();
	}
	request.send();

	}
}

function drawSpecialNode(json){


	const popupComponent = viewer.getComponent('popup');

	//nodeの平均値をとる
	let node_list = [];
	let lat_sum=0;
	let lon_sum=0;
	let node_count=0;
	const osm_elements = json.elements;
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
	let object;
	for (let i=0; i<osm_elements.length; i++){
		const item = osm_elements[i];
		if(item.tags){
			if(item.tags.name){
				object = item;
			}
		}
	}	

	const [distance, phi] = getDistancePhi(node_latlon, {lat:lat_av, lon:lon_av});
	const x = ((phi - node_ca + 180) % 360 + 360) /360;




	//ポップアップを作成

	const div = document.createElement('div');
		
	div.innerHTML = divContent(object, "specialnode");
	div.className = "tooltip1";
	div.color = "#ff0000";
	const popup = new Mapillary.PopupComponent.Popup();
	popup.setDOMContent(div);
	//遠い店舗は上のほうに表示
	popup.setBasicPoint([x, 0.4]);
	popupComponent.add([popup]);
	
	window.addEventListener("resize", function() { viewer.resize(); });
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
	  
  viewer_marker = L.marker([0,0], { draggable: false }).addTo(map);

  	
	var hash = new L.Hash(map);

	//URLに座標が付いていたらその場所を初期位置にする。
	const url = location.href;
	const match = url.match(/#(\d{1,2})\/(-?\d[0-9.]*)\/(-?\d[0-9.]*)/);
	if (match){
		const [, zoom, lat, lon] = match;
		map.setView([lat, lon], zoom);
	} else {
		map.setView([52.1564626, 5.389414243], 16);
	}
	

}

function goMapCenterButton(){
	const center = map.getCenter();
	viewer.moveCloseTo(center.lat, center.lng);

}