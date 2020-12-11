module.exports = function(RED) {
    "use strict";

    var EVENT_ID = "node:";

    var TXT_ACTIVE = RED._("status.active");
    var TXT_INACTIVE = RED._("status.inactive");
    var TXT_LOCKED = RED._('status.locked');
    var TXT_UNLOCKED = RED._('status.unlocked');
    var TXT_NA = RED._("status.na");

    // IN
    function SwitchBreakActorNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        var locked;
        var lastMsg;

        var handler = msg => {
            // Abort on same
            if (locked == msg.locked)
                return;
            
            // Get if locked
            locked = msg.locked;
            node.status({fill:locked?'red':'green', shape:'dot', text:locked?TXT_LOCKED:TXT_UNLOCKED});

            // If unlocked, then send last message.
            if (!locked && config.resendLast) {
                if (lastMsg !== undefined)
                    node.receive(lastMsg);
            }
        }

        RED.events.on(EVENT_ID + config.director,handler);

        
        this.on("input", function(msg, send, done) {
            if (locked) {
                // When unlock occurs, the last message can be sent.
                lastMsg = msg;
                done();
                return;
            }
            
            lastMsg = undefined;
            send(msg);
            done();
        });
        
        this.on("close",function() {
            RED.events.removeListener(EVENT_ID + config.director,handler);
        });
    }
    RED.nodes.registerType("break actor",SwitchBreakActorNode);



    // OUT
    function SwitchBreakDirectorNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        var event = EVENT_ID + this.id;
        var locked = config.defaultState;
        var hReset;
        var h;

        if (config.timeOutUnit === "milliseconds") this.timeOut = config.timeOut;
        else if (config.timeOutUnit === "minutes") this.timeOut = config.timeOut * (60 * 1000);
        else if (config.timeOutUnit === "hours")   this.timeOut = config.timeOut * (60 * 60 * 1000);
        else if (config.timeOutUnit === "days")    this.timeOut = config.timeOut * (24 * 60 * 60 * 1000);
        else this.timeOut = config.timeOut * 1000;

        function updateStatus(res) {
            if (h !== undefined) {
                clearTimeout(h);
                h = undefined;
            }

            if (res !== undefined) {
                node.status({fill:res?'red':'green', shape:'dot', text:res?TXT_ACTIVE:TXT_INACTIVE});
            } else {
                node.status({fill:'yellow', shape:'dot', text:TXT_NA});
                h = setTimeout(()=>updateStatus(locked), 1500);
            }
        }

        this.on("input", function(msg, send, done) {
            msg._event = event;
            
            var inputValue = RED.util.evaluateNodeProperty(config.inputValue, config.inputType, node, msg);
            
            var res;
            if (config.lockType == 'else') {
                var unlockValue = RED.util.evaluateNodeProperty(config.unlockValue, config.unlockType, node, msg);
                res = (inputValue != unlockValue);
                
            } else if (config.unlockType == 'else') {
                var lockValue = RED.util.evaluateNodeProperty(config.lockValue, config.lockType, node, msg);
                res = (inputValue == lockValue);
            } else {
                var lockValue = RED.util.evaluateNodeProperty(config.lockValue, config.lockType, node, msg);
                var unlockValue = RED.util.evaluateNodeProperty(config.unlockValue, config.unlockType, node, msg);
                
                if (inputValue == lockValue) {
                    res = true;
                } else if (inputValue == unlockValue) {
                    res = false;
                }
            }

            if (res != undefined) {
                locked = res;
                msg.locked = res;
                RED.events.emit(event,{locked:res});

                // Clear timeout
                if (hReset != undefined) {
                    clearTimeout(hReset);
                    hReset = undefined;
                }

                // If not default state, then set timeout.
                if (res != config.defaultState) {
                    hReset = setTimeout(()=>{
                        locked = config.defaultState;
                        updateStatus(locked);
                        RED.events.emit(event, {locked:locked})
                        hReset = undefined;
                    }, node.timeOut);
                }
            }
            updateStatus(res);
            
            send(msg);
            done();
        });

        setTimeout(()=>{
            updateStatus(locked);
            RED.events.emit(event, {locked:locked})
        }, 250);
    }
    RED.nodes.registerType("break director",SwitchBreakDirectorNode);
}
