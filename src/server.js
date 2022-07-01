//------------------------------------------------------
//TODO:
// empezar a crear visualizacion
// Filtro de stock si es necesario
// en lugar de buscar en la página de ofertas, buscar en todo el catálogo
// en la visualización, diseñar un filtro para quitar ofertas de poco interés (productos que llevan en oferta años)
//
//----------------------------------------------------

var express = require('express');
var fs = require('fs');
const path = require('path');
const directoryPath = path.join(__dirname, '../output');
var request = require('request');
var cheerio = require('cheerio');
var app     = express();
var json = {};
const PRECIO_MINIMO = 19;
const DESCUENTO_ABSOLUTO_MINIMO = 4;
const DESCUENTO_PORCENTAJE_MINIMO = 9;
const MIN_TEMP_REQUEST = 15000;
var synlock = false;

var datos = JSON.parse(fs.readFileSync('webs.json'));

app.get('/update', function(req, res){
        
    if(synlock){
        return res.send("Servidor ocupado, intentalo mas tarde")
    }
    synlock = true;

    var oldJson = JSON.parse(fs.readFileSync('output/' + ficheroViejo()));

    var fechaActual = new Date();
    var colaLlamadas = [];
    for (i = 1; i < datos.length; i++){ //empezamos en 1 ya que el 0 lo vamos a meter manualmente
        colaLlamadas.push({
            posWeb : i,
            pagina : 1,
            insertada : new Date()
        })
    }

    scrappear(datos[0], 0, 1);

    function scrappear(datosWeb, posWeb, pagina) {
             var ultimoPrecio;

            console.log("llamada a " + datosWeb.url + pagina + datosWeb.url2);
            
            const options = {
                url: datosWeb.url + pagina + datosWeb.url2,
                headers: {
                    "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36",
                    "accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
                    "accept-language":"es-ES",
                    "referer": "https://www.google.com/"
                }
              };

            request(options, function(error, response, html){
                if(!error){
                    var $ = cheerio.load(html);
    
                    var productos =  $(datosWeb.productos);

                    $(productos).each(function(i, link){    
                        var data = $(this);
                        var j = {};
                        
                        if(Boolean(data.find(datosWeb.disponibilidad).length) == datosWeb.disponibilidadDebeSer ){
                            var id = data.find(datosWeb.id).attr("href");
                            j["titulo"] = (datosWeb.tituloAttr == null ?  data.find(datosWeb.titulo).text() : data.find(datosWeb.titulo).attr(datosWeb.tituloAttr)).replace(/[\n\t\r]/g,"").trim();
                            j["precio"] =  parseFloat(data.find(datosWeb.precio).text().replace(',','.').replace(/ |€/g,''));
                            if (data.find(datosWeb.precioAnterior))
                                j["precioAnterior"] = ultimoPrecio = parseFloat(data.find(datosWeb.precioAnterior).text().replace(',','.').replace(/ |€/g,''));
                            else 
                                j["precioAnterior"] = ultimoPrecio = j["precio"];
                            j["descuentoAbsoluto"] = parseFloat((j["precioAnterior"] - j["precio"]).toFixed(2));
                            j["descuentoPorcentaje"] = parseFloat(((j["descuentoAbsoluto"] * 100) / j["precioAnterior"]).toFixed(2));
                            j["tienda"] = datosWeb.tienda;

                            if (oldJson[id] == undefined || oldJson[id]["precio"] > j["precio"])
                                j["novedad"] = true;
                            else
                                j["novedad"] = false;

                            if(j["descuentoAbsoluto"] > DESCUENTO_ABSOLUTO_MINIMO && j["descuentoPorcentaje"] > DESCUENTO_PORCENTAJE_MINIMO && j["precioAnterior"] > PRECIO_MINIMO){
                                json[id] = j;
                            }
                        }
                    });
                }
                if(ultimoPrecio < PRECIO_MINIMO || pagina > 8 || error || productos.length == 0){ //web terminada
                    if(colaLlamadas.length != 0){
                        var proxLlamada = colaLlamadas.shift(); 
                        var tiempoSiguienteLlamada = Math.max(MIN_TEMP_REQUEST - (new Date - proxLlamada.insertada), 1000);
                        console.log("Siguiente llamada en " + tiempoSiguienteLlamada);
                        setTimeout(scrappear, tiempoSiguienteLlamada , datos[proxLlamada.posWeb], proxLlamada.posWeb, proxLlamada.pagina);
                    }
                    else{ //fin
                        var fecha = new Date;

                        fs.writeFile('output/' + fecha.getFullYear() + ("0" + (fecha.getMonth() + 1)).slice(-2) + ("0" + fecha.getDate()).slice(-2) + ("0" + fecha.getHours()).slice(-2) + ("0" + fecha.getMinutes()).slice(-2) + '.json', JSON.stringify(json, null, 4), function(err){
                            if(err)
                                console.log("Ha habido un error");
                            else
                                console.log('' + fecha.getFullYear() + ("0" + (fecha.getMonth() + 1)).slice(-2) + ("0" + fecha.getDate()).slice(-2) + ("0" + fecha.getHours()).slice(-2) + ("0" + fecha.getMinutes()).slice(-2) + '.json creado');
                        })
                        //respuesta final
                        synlock = false;
                        res.json(json);
                    }
                } else{ //misma web, siguiente página

                    colaLlamadas.push({
                        posWeb : posWeb,
                        pagina : pagina + 1,
                        insertada : new Date()
                    })

                    var proxLlamada = colaLlamadas.shift(); 
                    
                    var tiempoSiguienteLlamada = Math.max(MIN_TEMP_REQUEST - (new Date - proxLlamada.insertada), 100);
                    
                    console.log("Siguiente llamada en " + tiempoSiguienteLlamada);

                    setTimeout(scrappear, tiempoSiguienteLlamada , datos[proxLlamada.posWeb], proxLlamada.posWeb, proxLlamada.pagina);
                }
                    
            });
    }
});

//example query: http://localhost:8081/get?orden=descuentoPorcentaje&novedades=true
app.get('/get', function(req, res){
    var retJSON = JSON.parse(fs.readFileSync('output/' + ultimoFichero()));
    var jsonOrdenado = {}
    var orden = "descuentoPorcentaje";
    var eliminarTienda = "";

    if (req.query.orden != undefined)
        orden = req.query.orden;

    if (req.query.eliminarTienda != undefined)
        eliminarTienda = req.query.eliminarTienda;

    Object
    .keys(retJSON).sort(function(a, b){
        return retJSON[b][orden] - retJSON[a][orden];
    })
    .forEach(function(key) {
        if((req.query.novedades == undefined || retJSON[key].novedad == true) && (eliminarTienda == "" || retJSON[key].tienda != eliminarTienda))
            jsonOrdenado[key] = retJSON[key];
    });

    res.send(jsonOrdenado);
});

app.get('/test', function(req, res){
    var datosWeb = datos[2];
    var logs = "";
    
    logs += "EMPEZANDO TEST<br>";

    const options = {
        url: datosWeb.url + 1 + datosWeb.url2,
        headers: {
            "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36",
            "accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
            "accept-language":"es-ES",
            "referer": "https://www.google.com/"
        }
      };

    request(options, function(error, response, html){
        console.log("request a " +datosWeb.url + 1 + datosWeb.url2 )
        var $ = cheerio.load(html);
        var productos =  $(datosWeb.productos);

        logs += "Cantidad de productos: " + productos.length + "<br>";
        $(productos).each(function(i, link){    
            var data = $(this);
            logs += "NUEVO PRODUCTO <br>";

            logs += "Criterio de disponibilidad: " + data.find(datosWeb.disponibilidad).length + "- Debe ser: " +  datosWeb.disponibilidadDebeSer + "<br>";

            if(Boolean(data.find(datosWeb.disponibilidad).length) == datosWeb.disponibilidadDebeSer ){
                logs += "ID: " +  data.find(datosWeb.id).attr("href") + "<br>";
                logs += "Nombre: " +  (datosWeb.tituloAttr == null ?  data.find(datosWeb.titulo).text() : data.find(datosWeb.titulo).attr(datosWeb.tituloAttr)) + "<br>";
                logs += "Precio: " +  parseFloat(data.find(datosWeb.precio).text().replace(',','.').replace(/ |€/g,'')) + "<br>";
                logs += "PrecioAnterior: " + parseFloat(data.find(datosWeb.precioAnterior).text().replace(',','.').replace(/ |€/g,'')) + "<br>";
            }
        });
        console.log("Test terminado ");
        
        res.send(logs);
    });
});

app.listen('8081');
console.log('Servidor escuchando en puerto 8081'); 

function ficheroViejo(){

    var ficheros = fs.readdirSync(directoryPath);

    ficheros.sort(function(a, b) {
        return fs.statSync(directoryPath + "/" +  b).mtime.getTime() - 
            fs.statSync(directoryPath + "/" + a).mtime.getTime();
    });

    var fecha = new Date;
    for (let f of ficheros) {
        if (f.substring(0,8) != '' + fecha.getFullYear() + ("0" + (fecha.getMonth() + 1)).slice(-2) + ("0" + fecha.getDate()).slice(-2))
            return f;
    }

    throw NoOldJsonFound;
}

function ultimoFichero(){

    var ficheros = fs.readdirSync(directoryPath);

    ficheros.sort(function(a, b) {
        return fs.statSync(directoryPath + "/" +  b).mtime.getTime() - 
            fs.statSync(directoryPath + "/" + a).mtime.getTime();
    });

    return ficheros[0];
}

function comparar(prop) {
    return function(a, b) {
        return b[prop] - a[prop];
    }
}

Object.filter = function(obj, predicate) {
    let result = {}, key;

    for (key in obj) {
        if (obj.hasOwnProperty(key) && !predicate(obj[key])) {
            result[key] = obj[key];
        }
    }

    return result;
};

exports = module.exports = app;