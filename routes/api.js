/*
*
*
*       Complete the API routing below
*
*
*/

'use strict';

var expect = require('chai').expect;
var MongoClient = require('mongodb');
var mongoose = require('mongoose');
var fetch = require('node-fetch');

const CONNECTION_STRING = process.env.DB; //MongoClient.connect(CONNECTION_STRING, function(err, db) {});

module.exports = function (app) {
  
  // Connect to the DB
  mongoose.connect(CONNECTION_STRING);
  
  // Create Schema and model to save unique likes for each stock symbol
  var Schema = mongoose.Schema;
  var stockSchema = new Schema({
    stockName: String,
    likes: [String]
  });
  var Stock = mongoose.model('Stock', stockSchema);
  
  // Using stock data from the IEX Trading API: https://iextrading.com/developer/docs/#price
  // Function converts array of stock ticker names into latest price information
  function iexQuery(arr) {
    var query = [];
    arr = Array.isArray(arr) ? arr : [arr];
    arr.forEach((item) => {
      query.push("https://api.iextrading.com/1.0/stock/" + item + "/price");
    });
    
    return query;
  }
  
  app.route('/api/stock-prices')
    .get(function (req, res){
    
      var stockName = Array.isArray(req.query.stock) ? req.query.stock : [req.query.stock];
      var likeStatus = req.query.like;
      var stockPrice;
      var currIP = req.connection.remoteAddress;
      var apiUrl;
      var promise1, promise2;
      var likes;

      if (stockName.length == 1) {
        // For one stock query, look up the corresponding price,
        // save like status for the current IP, and return the total amount of unique likes
        
        // Looks up stock likes status and updates accordingly
        Stock.findOne({stockName: stockName[0].toUpperCase()}, function(err, stock) {

          if (err) {
            console.log(err);
            res.send("An error has occurred");
          } else if (stock == null && likeStatus) {
            var newStock = new Stock({stockName: stockName[0].toUpperCase()});
            newStock.likes.push(currIP);
            newStock.save(function(err) {
              if (err) { res.send("Error updating DB.") }
            });
          } else {
            if (likeStatus && stock.likes.indexOf(currIP) == -1) {
              stock.likes.push(currIP);
              stock.save(function(err) {
                if (err) { res.send("Error updating DB.") }
              });
            }
          }

          // Calls stock API
          apiUrl = iexQuery(stockName[0]);
          fetch(apiUrl[0])
            .then((resp) => resp.json())
            .then(function(data) {

            stockPrice = data;

            // Like count
            if (stock) {
              likes = stock.likes.length;
            } else {
              likes = likeStatus ? 1 : 0;
            }

            // Final response
            res.json({stockData: {stock: stockName[0].toUpperCase(), price: stockPrice, likes: likes}});
          });
        
        });
        
        
        
        } else if (stockName.length == 2) {
          // For two stock queries, look up each corresponding price,
          // save like status for the current IP,
          // and calculate the relative number of likes
    
          Stock.find().or([{stockName: stockName[0].toUpperCase()},{stockName: stockName[1].toUpperCase()}]).exec(function(err, stocks){

            // Cases where one is found, both ar found
            if (err) {
              console.log(err);
              res.send("An error has occurred.");
            } else if (stocks.length == 0 && likeStatus) {
              var newStockA = new Stock({stockName: stockName[0].toUpperCase()});
              newStockA.likes.push(currIP);
              newStockA.save(function(err) {
                if (err) { res.send("Error updating DB.") }
              });
              var newStockB = new Stock({stockName: stockName[1].toUpperCase()});
              newStockB.likes.push(currIP);
              newStockB.save(function(err) {
                if (err) { res.send("Error updating DB.") }
              });
            } else if (stocks.length == 1 && likeStatus) {
              // Case where they are liked and one stock is found
              if (stocks["stockName"] == stockName[0].toUpperCase() && stocks.likes.indexOf(currIP) == -1) {
                var newStockB = new Stock({stockName: stockName[1].toUpperCase()});
                newStockB.likes.push(currIP);
                newStockB.save(function(err) {
                  if (err) { res.send("Error updating DB.") }
                });

                stocks.likes.push(currIP);
                stocks.save(function(err) {
                  if (err) { res.send("Error updating DB.") }
                });
              } else if (stocks["stockName"] == stockName[1].toUpperCase() && stocks.likes.indexOf(currIP) == -1) {
                var newStockA = new Stock({stockName: stockName[0].toUpperCase()});
                newStockA.likes.push(currIP);
                newStockA.save(function(err) {
                  if (err) { res.send("Error updating DB.") }
                });

                stocks.likes.push(currIP);
                stocks.save(function(err) {
                  if (err) { res.send("Error updating DB.") }
                });
              }
            } else {
              // Add if statement for if liked
              if (likeStatus && stocks[0].likes.indexOf(currIP) == -1) {
                stocks[0].likes.push(currIP);
                stocks.save(function(err) {
                  if (err) { res.send("Error updating DB.") }
                });
              } else if (likeStatus && stocks[1].likes.indexOf(currIP) == -1) {
                stocks[1].likes.push(currIP);
                stocks.save(function(err) {
                  if (err) { res.send("Error updating DB.") }
                });
              }
            }
          
            // Call to stock API
            apiUrl = iexQuery(stockName);
            promise1 = fetch(apiUrl[0]).then((resp) => resp.json() );
            promise2 = fetch(apiUrl[1]).then((resp) => resp.json() );
            Promise.all([promise1, promise2]).then(function(results) {
              stockPrice = [];
              stockPrice[0] = results[0];
              stockPrice[1] = results[1];

              // Like count
              if (stocks.length == 2) {
                likes = [stocks[0].likes.length, stocks[1].likes.length];
              } else if (stocks.length == 1) {
                if (stocks[0].stockName == stockName[0]) {
                  likes = likeStatus ? [stocks[0].likes.length, 1] : [stocks[0].likes.length, 0];
                } else {
                  likes = likeStatus ? [1, stocks[0].likes.length] : [0, stocks[0].likes.length]
                }
              } else {
                likes = likeStatus ? [1, 1] : [0, 0];
              }

              
              // Final response          
              res.json({stockData: [
                {stock: stockName[0].toUpperCase(), price: stockPrice[0], rel_likes: likes[0] - likes[1]},
                {stock: stockName[1].toUpperCase(), price: stockPrice[1], rel_likes: likes[1] - likes[0]}
              ]});
            });
            
        });
        
      } else {
        res.send("Error with stock query. Please enter one or two valid NASDAQ stock tickers.");
      }
    });
    
};
  