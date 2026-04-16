import asyncio
import json
import random
import string
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

GRID_WIDTH = 30
GRID_HEIGHT = 30
TICK_RATE = 0.15  # 150ms

rooms = {}

COLORS = ['#ff007f', '#00f3ff', '#00ff00', '#ffff00', '#ff8c00', '#8a2be2']

def generate_room_id():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=4))

class Room:
    def __init__(self, room_id):
        self.room_id = room_id
        self.players = {}
        self.food = self.spawn_food()
        self.obstacles = []
        self.status = "waiting"
        self.level = 1
        self.connections = {}
        self.loop_task = None
        self.tick_rate = 0.15

    def add_player(self, socket_id, websocket: WebSocket):
        color = COLORS[len(self.players) % len(COLORS)]
        self.players[socket_id] = {
            "id": socket_id,
            "color": color,
            "snake": [{"x": random.randint(5, 25), "y": random.randint(5, 25)}],
            "direction": {"x": 1, "y": 0},
            "nextDirection": {"x": 1, "y": 0},
            "score": 0,
            "isAlive": True
        }
        # default small snake
        head = self.players[socket_id]["snake"][0]
        self.players[socket_id]["snake"] = [
            {"x": head["x"], "y": head["y"]},
            {"x": head["x"] - 1, "y": head["y"]},
            {"x": head["x"] - 2, "y": head["y"]}
        ]
        self.connections[socket_id] = websocket

    def remove_player(self, socket_id):
        if socket_id in self.players:
            del self.players[socket_id]
        if socket_id in self.connections:
            del self.connections[socket_id]

    def spawn_food(self):
        while True:
            pos = {"x": random.randint(0, GRID_WIDTH - 1), "y": random.randint(0, GRID_HEIGHT - 1)}
            # check collision with snakes
            collision = False
            for p in self.players.values():
                for segment in p["snake"]:
                    if segment["x"] == pos["x"] and segment["y"] == pos["y"]:
                        collision = True
            for obs in getattr(self, 'obstacles', []):
                if obs["x"] == pos["x"] and obs["y"] == pos["y"]:
                    collision = True
                    
            if not collision:
                return pos

    def get_state(self):
        return {
            "roomId": self.room_id,
            "players": {p_id: details for p_id, details in self.players.items()},
            "food": self.food,
            "obstacles": self.obstacles,
            "status": self.status,
            "level": self.level
        }

    async def broadcast(self, message):
        msg_str = json.dumps(message)
        for ws in list(self.connections.values()):
            try:
                await ws.send_text(msg_str)
            except Exception:
                pass


async def game_loop(room: Room):
    while True:
        await asyncio.sleep(room.tick_rate)
        
        if room.status != "playing":
            continue

        state_changed = False
        
        # update positions
        for p_id, p in list(room.players.items()):
            if not p["isAlive"]:
                continue
                
            p["direction"] = p["nextDirection"]
            head = p["snake"][0]
            new_head = {"x": head["x"] + p["direction"]["x"], "y": head["y"] + p["direction"]["y"]}
            
            # wrap around
            new_head["x"] = (new_head["x"] + GRID_WIDTH) % GRID_WIDTH
            new_head["y"] = (new_head["y"] + GRID_HEIGHT) % GRID_HEIGHT
            
            # Check collisions
            crashed = False
            
            # 1. Self collision or other player collision
            for other_p_id, other_p in room.players.items():
                if not other_p["isAlive"]: continue
                for segment in other_p["snake"]:
                    if segment["x"] == new_head["x"] and segment["y"] == new_head["y"]:
                        crashed = True
                        break
                if crashed: break
            
            p["snake"].insert(0, new_head)
            
            if crashed:
                p["isAlive"] = False
                p["snake"].pop(0) # remove head if crashed
                await room.broadcast({"type": "gameOver", "playerId": p_id})
                continue
                
            # Check food
            if new_head["x"] == room.food["x"] and new_head["y"] == room.food["y"]:
                p["score"] += 10
                room.food = room.spawn_food()
            else:
                p["snake"].pop() # tail remove
                
            state_changed = True

        if state_changed:
            await room.broadcast({"type": "gameUpdate", "state": room.get_state()})

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    socket_id = str(id(websocket))
    current_room = None
    
    try:
        while True:
            data = await websocket.receive_text()
            event = json.loads(data)
            
            msg_type = event.get("type")
            
            if msg_type == "createRoom":
                speed_val = event.get("speed", 2)
                tick_rates = {1: 0.25, 2: 0.15, 3: 0.08}
                room_id = generate_room_id()
                room = Room(room_id)
                room.tick_rate = tick_rates.get(speed_val, 0.15)
                rooms[room_id] = room
                room.add_player(socket_id, websocket)
                current_room = room
                await websocket.send_text(json.dumps({"type": "roomCreated", "roomId": room_id}))
                await websocket.send_text(json.dumps({"type": "roomJoined", "state": room.get_state(), "socketId": socket_id}))
                
            elif msg_type == "joinRoom":
                room_id = event.get("roomId", "").upper()
                if room_id in rooms:
                    room = rooms[room_id]
                    room.add_player(socket_id, websocket)
                    current_room = room
                    await websocket.send_text(json.dumps({"type": "roomJoined", "state": room.get_state(), "socketId": socket_id}))
                    await room.broadcast({"type": "gameUpdate", "state": room.get_state()})
                else:
                    await websocket.send_text(json.dumps({"type": "error", "message": "Room not found"}))
                    
            elif msg_type == "startGame":
                if current_room and current_room.status == "waiting":
                    current_room.status = "playing"
                    if not current_room.loop_task:
                        current_room.loop_task = asyncio.create_task(game_loop(current_room))
                    await current_room.broadcast({"type": "gameStarted"})
                    
            elif msg_type == "changeDirection":
                dir = event.get("direction")
                if current_room and socket_id in current_room.players:
                    p = current_room.players[socket_id]
                    if p["isAlive"]:
                        p_dir = p["direction"]
                        # prevent reverse
                        if dir["x"] != 0 and p_dir["x"] == -dir["x"]:
                            continue
                        if dir["y"] != 0 and p_dir["y"] == -dir["y"]:
                            continue
                        p["nextDirection"] = dir

    except WebSocketDisconnect:
        if current_room:
            current_room.remove_player(socket_id)
            if len(current_room.players) == 0:
                if current_room.loop_task:
                    current_room.loop_task.cancel()
                del rooms[current_room.room_id]
            else:
                asyncio.create_task(current_room.broadcast({"type": "gameUpdate", "state": current_room.get_state()}))

@app.get("/")
async def root():
    return FileResponse("index.html")

app.mount("/", StaticFiles(directory="."), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
