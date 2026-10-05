import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../config.dart';

class SocketService{
  // Singleton - one socket connection for the whole app
  SocketService._internal();
  // to restrict the use of socket to one instance 
  static final SocketService instance =  SocketService._internal();

  IO.Socket? _socket;

  bool get isConnected => _socket?.connected ?? false;
  String? get playerId => _socket?.id;
   // we use getter when we want to access method like a variable 
   // becuase upon keeping getter we are askign dart to recalculate the value when accessing 

  // The server sends role_assigned just before phase_change, i.e. before the
  // game screen exists, so the role is remembered here.
  Map? lastRole;
  String? roomCode;

  List<dynamic>? _currentPlayers;
  set players(List<dynamic> p){_currentPlayers = p;}
  List<dynamic>? get currentPlayers => _currentPlayers;

  void connect(){
    if(isConnected) return;

    _socket = IO.io(serverUrl, <String, dynamic>{
      'transports': ['websocket', 'polling'],
      'autoConnect': true,
    });
    // this creates the socket instance with backend url as serverUrl, here transports tell how to connect to server
    // i)polling: Client sends http req again and again every few secs for new data ,slow more usage 
    // ii) websocket - one single permanent connection stays open . server can push data instantly

    _socket!.onConnect((_)=>print('Socket connected: ${_socket!.id}'));
    _socket!.onDisconnect((_)=>print('Socket disconnected'));
    _socket!.on('connect_error',(data)=>print('Connect error: $data'));
  }

  void disconnect()=>_socket?.disconnect();
  
  //client->server Actions
  
  void createRoom(String playerName,{String? uid}){
    _socket?.emit('create_room',{'playerName':playerName,'uid':uid});
  }
  // here string used is create_room so on server(node.js) also must listen with same string
  
  void joinRoom(String roomCode,String playerName,{String? uid}){
    _socket?.emit('join_room',{'roomId':roomCode,'playerName':playerName,'uid':uid});
  }

  void toggleReady(){
    _socket?.emit('toggle_ready');
  }

  void leaveRoom(){
    _socket?.emit('leave_room');
    _currentPlayers = null;
    lastRole = null;
    roomCode = null;
  }

  void startGame()=>_socket?.emit('start_game');  

  void submitClue(String clue,String playerName){
    _socket?.emit('submit_clue',{'clue':clue,'playerName':playerName});
  }

  void submitVote(String votedPlayerId){
    _socket?.emit('submit_vote',{'votedPlayerId':votedPlayerId});
  }
//---------------------------------------------------------------

  //Event listeners

// it is on the receiving side - it listens for a server event and forwards the data to your UI thr callback 
// here Function(Map) cb - it is a callback function which we pass and accepts a Map . Here .on() registers a listener on the Socket
// (data)=>cb(data as Map) - when event arrives socket gives you data 
  void onRoomCreated(Function(Map) cb){
    _socket?.off('room_created');
    _socket?.on('room_created',(data)=>cb(data as Map));
  }

  void onRoomJoined(Function(Map) cb){
    _socket?.off('room_joined');
    _socket?.on('room_joined',(data)=>cb(data as Map));
  }

  void onHostChanged(Function(Map) cb){
    _socket?.off('host_changed');
    _socket?.on('host_changed',(data)=>cb(data as Map));
  }

  void onPlayersUpdated(Function(List) cb){
    _socket?.off('players_updated');
    _socket?.on('players_updated',(data){
      _currentPlayers=data;
      cb(data as List);
    });
  }

  void onPhaseChange(Function(Map) cb){
    _socket?.off('phase_change');
    _socket?.on('phase_change',(data)=>cb(data as Map));
  }

  void onPlayerJoined(Function(Map) cb){
    _socket?.off('player_joined');
    _socket?.on('player_joined',(data)=>cb(data as Map));
  }

  void onError(Function(Map) cb){
    _socket?.off('error');
    _socket?.on('error',(data)=>cb(data as Map));
  }

  void onRoleAssigned(Function(Map) cb){
    _socket?.off('role_assigned');
    _socket?.on('role_assigned',(data){
      lastRole = data as Map;
      cb(data);
    });
  }

  void onClueSubmitted(Function(List) cb){
    _socket?.off('clue_submitted');
    _socket?.on('clue_submitted',(data)=>cb(data as List));
  }

  void onTimerTick(Function(int) cb){
    _socket?.off('timer_tick');
    _socket?.on('timer_tick',(data)=>cb(data as int));
  }

  void onVotesUpdated(Function(Map) cb){
    _socket?.off('votes_updated');
    _socket?.on('votes_updated',(data)=>cb(data as Map));
  }

  void onRoundResults(Function(Map) cb){
    _socket?.off('round_results');
    _socket?.on('round_results',(data)=>cb(data as Map));
  }

  void onRoomReset(Function(Map) cb){
    _socket?.off('room_reset');
    _socket?.on('room_reset',(data)=>cb(data as Map));
  }



}