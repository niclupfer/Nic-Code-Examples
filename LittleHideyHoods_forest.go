package main

import (
	"fmt"
	"time"
	"context"
	"math/rand"
	"unsafe"	
	"reflect"
	"net/http"
	"encoding/json"

	"github.com/gin-gonic/gin"
	
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	//"go.mongodb.org/mongo-driver/mongo/options"	
	
	//"github.com/markbates/goth"
)

/** Data Structs **/

type ForestRow struct {
	ID			primitive.ObjectID	`bson:"_id,omitempty"` // unique
	Key			string				`bson:"key,omitempty"`
	Attempts	int					`bson:"attempts,omitempty"`
	Wins		int					`bson:"wins,omitempty"`
	Fails		int					`bson:"fails,omitempty"`
	CreatedOn	primitive.Timestamp `bson:"createdOn"`
	LastUpdated	primitive.Timestamp `bson:"lastUpdated"`
}

type Forest struct {
	Key			string				`json:"Key,omitempty"`
	Host		string				`json:"Host,omitempty"`
	State		string				`json:"State,omitempty"`
	GameTime	float32				`json:"GameTime,omitempty"`
	Players 	map[string]*ForestPlayer		`json:"Players,omitempty"`
	Items		map[string]*ForestItem		`json:"Items,omitempty"`
	Tiles		map[string]*ForestTile		`json:"Tiles,omitempty"`
}

type ForestTile struct {
	ID			string		`json:"ID,omitempty"`
	X			int			`json:"X,omitempty"`
	Y			int			`json:"Y,omitempty"`
	Type		string		`json:"Type,omitempty"`
	Connections []string	`json:"Connections"`
}

type ForestPlayer struct {
	ID		string			`json:"ID,omitempty"`
	Name	string			`json:"Name,omitempty"`
	Type	string			`json:"Type,omitempty"`
	Color	string			`json:"Color,omitempty"`
	State	ObjState		`json:"State,omitempty"`
}

type ForestItem struct {
	ID		string			`json:"ID,omitempty"`
	Name	string			`json:"Name,omitempty"`
	Updater string 			`json:"Updater,omitempty"`
	State	ItemState 		`json:"State,omitempty"`
}

type ObjState struct {
	GameTime	float32     `bson:"GameTime,omitempty"`
	State		int         `bson:"State,omitempty"`
	Angle		float32     `bson:"Angle,omitempty"`
	Position	Pos3        `bson:"Position,omitempty"`
	Revealed	bool		`bson:"Revealed,omitempty"`
}

type ItemState struct {
	GameTime	float32     `bson:"GameTime,omitempty"`
	State		int         `bson:"State,omitempty"`
	Angles		Pos3        `bson:"Angle,omitempty"`
	Position	Pos3        `bson:"Position,omitempty"`
}

type Pos2 struct {
	X	float32        `json:"x,omitempty"`
	Y	float32        `json:"y,omitempty"`
}

type Pos3 struct {
	X	float32        `json:"x,omitempty"`
	Y	float32        `json:"y,omitempty"`
	Z	float32        `json:"z,omitempty"`
}

var Game_Version = "0.0.3"
var Max_Players_Per_Forest = 5 // ? im guessing

/** Route Handlers **/

func forest_LookIn(c *gin.Context) {
	forestKey := c.Param("key")
	forest := GetForestRow(forestKey)
	if forest.Key == "" {
		var empty = make([]string, 0)
		c.JSON(http.StatusOK, gin.H{"forestRow": empty})
	} else {
		c.JSON(http.StatusOK, gin.H{"forestRow": forest})
	}
}

func forest_LivePeek(c *gin.Context) {
	forestKey := c.Param("key")
	forest := forests[forestKey]	

	if !HasLiveForest(forestKey) {
		var empty = make([]string, 0)
		c.JSON(http.StatusOK, gin.H{"forest": empty})
	} else {
		c.JSON(http.StatusOK, gin.H{"forest": forest})
	}
}

func forest_Create(c *gin.Context) {
	fmt.Println("Creating forest")
	newKey := GenerateForestKey(4)

	// generate new room info
	newForest := &ForestRow{
		Key: newKey,
		Wins: 0,
		Fails: 0,
		Attempts: 0,
		CreatedOn:  primitive.Timestamp{T:uint32(time.Now().Unix())},
		LastUpdated:  primitive.Timestamp{T:uint32(time.Now().Unix())},
	}
	
	result, insertErr := forestsCollection.InsertOne(context.Background(), newForest)
	if insertErr != nil {
		fmt.Println("InsertOne ERROR:", insertErr)
	} else {
		fmt.Println("InsertOne() result type: ", reflect.TypeOf(result))
		fmt.Println("InsertOne() API result: ", result)
		fmt.Println("InsertOne() InsertedID: ", result.InsertedID)
	}

	/*
	forests[newKey] = Forest{
		Key: newKey,
		Host: "",
		State: "empty",
		Players:  make([]ForestPlayer, 0),
		Items:  make([]ForestItem, 0),
		Tiles:  make([]ForestTile, 0),
	}
	*/

	c.JSON(http.StatusOK, gin.H{"forestRow": newForest})

	//c.String(http.StatusOK, "should create forest and return forest info: "+ newKey)
}


/** Live Forest **/

func ConnectToForest(forestKey string) json.RawMessage{

	fmt.Println("Connect to forest()")

	if !HasLiveForest(forestKey){
		newForest := &Forest{
			Key: forestKey,
			Host: "",
			State: "empty",
			Players:  make(map[string] *ForestPlayer),
			Items:  make(map[string] *ForestItem),
			Tiles: make(map[string] *ForestTile),
		}
		forests[forestKey] = newForest
	}

	forestP := forests[forestKey]

	if forestP.State == "gaming" {
		// send back their player ID
		msgJson, err := json.Marshal(WelcomeMsg {
			YourID: "MatchInProgress",
		})
	
		if err != nil {
			panic(err)
		}
	
		return msgJson
	}

	if len(forestP.Players) < Max_Players_Per_Forest {
		newPlayerId := GenerateForestThingID(forestP, 4)
	
		// send back their player ID
		msgJson, err := json.Marshal(WelcomeMsg {
			YourID: newPlayerId,	
			ForestState: *forestP,
			GameVersion: Game_Version,
		})
	
		if err != nil {
			panic(err)
		}
	
		return msgJson
	} else {	
		// send back their player ID
		msgJson, err := json.Marshal(WelcomeMsg {
			YourID: "AlreadyFull",
			GameVersion: Game_Version,
		})
	
		if err != nil {
			panic(err)
		}
	
		return msgJson
	}
}

/** Messages **/
type WelcomeMsg struct {
	YourID		string		`json:"yourID"`
	ForestState	Forest		`json:"forestState"`
	GameVersion string		`json:"gameVersion"`
}



/** Helpers **/

func GetForestRow(forestKey string) ForestRow {
	var forest ForestRow
	forestsCollection.FindOne(context.Background(), bson.M{"key": forestKey}).Decode(&forest)
	return forest
}

func HasLiveForest(forestKey string) bool {
	forest := forests[forestKey]
	if forest == nil {
		return false
	} else {
		return true
	}
}

func GenerateForestKey(length int) string {

	newKey := RandStringBytesMaskImprSrcUnsafe(length)

	if GetForestRow(newKey).Key != "" {
		//fmt.Println("Already have that key")
		return GenerateForestKey(length + 1)
	}
	return newKey
}

func GenerateForestThingID(forest *Forest, length int) string {

	newKey := RandStringBytesMaskImprSrcUnsafe(length)

	if forest.ForestHasID(newKey) {
		//fmt.Println("Already have that key")
		return GenerateForestThingID(forest, length + 1)
	}
	return newKey
}

func (forest *Forest) ForestHasID(id string) bool {

	for _, player := range forest.Players {
		if player.ID == id {
			return true
		}
	}

	return false
}

func (forest *Forest) AddPlayer(newPlayer *ForestPlayer) {
	forest.Players[newPlayer.ID] = newPlayer
}
func (forest *Forest) RemovePlayer(userId string) {
	delete(forest.Players, userId)
}

func (forest *Forest) HasItem(itemId string) bool {
	item := forest.Items[itemId]
	if item == nil {
		return false
	} else {
		return true
	}
}

func (forest *Forest) MaybeAddItem(newItem *ForestItem) {
	forest.Items[newItem.ID] = newItem
}

func forest_PlayerLeaving(forestKey string, userId string) {
	fmt.Println("Player leaving: "+userId)
	forestP := forests[forestKey]
	forestP.RemovePlayer(userId)
	if forestP.Host == userId {
		// return to lobby if the host left during a game
		if forestP.State == "gaming" {
			forestP.State = "lobby"
		}
		
		// choose new host
		if len(forestP.Players) == 0 {
			forestP.Host = ""
		} else {

			keys := make([]string, 0, len(forestP.Players))
			for _, k := range forestP.Players {
				keys = append(keys, k.ID)
			}

			randomIndex := rand.Intn(len(keys))	
			pick := forestP.Players[keys[randomIndex]]
			fmt.Println("new host: " +pick.ID)
			forestP.Host = pick.ID
		}
	}

	if len(forestP.Players) == 0 {
		forestP.State = "empty"
	}
}


var src = rand.NewSource(time.Now().UnixNano())
const letterBytes = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const (
    letterIdxBits = 6                    // 6 bits to represent a letter index
    letterIdxMask = 1<<letterIdxBits - 1 // All 1-bits, as many as letterIdxBits
    letterIdxMax  = 63 / letterIdxBits   // # of letter indices fitting in 63 bits
)

func RandStringBytesMaskImprSrcUnsafe(n int) string {
    b := make([]byte, n)
    // A src.Int63() generates 63 random bits, enough for letterIdxMax characters!
    for i, cache, remain := n-1, src.Int63(), letterIdxMax; i >= 0; {
        if remain == 0 {
            cache, remain = src.Int63(), letterIdxMax
        }
        if idx := int(cache & letterIdxMask); idx < len(letterBytes) {
            b[i] = letterBytes[idx]
            i--
        }
        cache >>= letterIdxBits
        remain--
    }

    return *(*string)(unsafe.Pointer(&b))
}