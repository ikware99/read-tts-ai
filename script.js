// 中文小说语音阅读器主脚本

class ChineseTTSReader {
    constructor() {
        this.segmentedText = [];
        this.currentParagraph = 0;
        this.isPlaying = false;
        this.speechSynthesis = window.speechSynthesis;
        this.utterance = null;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.source = null;
        this.voices = [];
        this.scrollTimer = null;
        this.autoScrollEnabled = true;
        this.floatControlsTimer = null;
        this.isControlsCollapsed = false;
        this.retryCount = 0;
        this.doubleClickTimer = null;
        this.doubleClickCount = 0;
        this.highlightEnabled = true;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.initWaveform();
        this.updateStats();
        this.initVoices();
    }

    // 初始化语音列表
    initVoices() {
        // 获取当前可用语音
        this.voices = this.speechSynthesis.getVoices();
        
        // 监听语音列表加载完成事件
        this.speechSynthesis.onvoiceschanged = () => {
            this.voices = this.speechSynthesis.getVoices();
            console.log('可用语音列表加载完成:', this.voices.map(v => v.name));
        };
    }

    // 获取指定voiceURI的语音对象
    getVoiceByURI(voiceURI) {
        // 尝试匹配voiceURI
        let voice = this.voices.find(voice => 
            voice.voiceURI === voiceURI || 
            voice.name === voiceURI ||
            voice.name.includes(voiceURI.split('-')[2])
        );
        
        // 如果找不到匹配的语音，尝试返回中文语音
        if (!voice) {
            voice = this.voices.find(voice => voice.lang === 'zh-CN');
        }
        
        // 如果还是找不到，返回默认语音
        if (!voice && this.voices.length > 0) {
            voice = this.voices[0];
        }
        
        return voice;
    }

    // 检查浏览器是否支持语音合成
    checkSpeechSupport() {
        if ('speechSynthesis' in window) {
            // 检查是否有可用语音
            if (this.voices.length === 0) {
                // 尝试立即获取语音列表
                this.voices = this.speechSynthesis.getVoices();
                
                if (this.voices.length === 0) {
                    alert('您的浏览器支持语音合成，但未检测到可用语音。请检查浏览器设置或更新浏览器版本。');
                    return false;
                }
            }
            return true;
        } else {
            alert('您的浏览器不支持语音合成功能，请使用Chrome 33+、Edge 14+或Safari 7+浏览器');
            return false;
        }
    }

    // 获取语音列表并等待加载完成
    async getVoicesAsync() {
        return new Promise((resolve) => {
            let voices = this.speechSynthesis.getVoices();
            if (voices.length > 0) {
                resolve(voices);
                return;
            }

            this.speechSynthesis.onvoiceschanged = () => {
                voices = this.speechSynthesis.getVoices();
                resolve(voices);
            };

            // 超时处理
            setTimeout(() => {
                resolve(this.speechSynthesis.getVoices());
            }, 2000);
        });
    }

    // 绑定事件监听器
    bindEvents() {
        // 处理文本按钮
        document.getElementById('processText').addEventListener('click', () => {
            this.processText();
        });

        // 播放控制按钮
        document.getElementById('playBtn').addEventListener('click', () => {
            this.play();
        });

        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.pause();
        });

        document.getElementById('stopBtn').addEventListener('click', () => {
            this.stop();
        });

        // 语音参数调节
        document.getElementById('rateSlider').addEventListener('input', (e) => {
            document.getElementById('rateValue').textContent = `${e.target.value}x`;
        });

        document.getElementById('pitchSlider').addEventListener('input', (e) => {
            document.getElementById('pitchValue').textContent = `${e.target.value}x`;
        });

        document.getElementById('volumeSlider').addEventListener('input', (e) => {
            document.getElementById('volumeValue').textContent = `${e.target.value}%`;
        });

        // 文件上传
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.loadFile(e.target.files[0]);
        });

        // 示例文本
        document.getElementById('loadExample').addEventListener('click', () => {
            this.loadExampleText();
        });

        // 文本输入变化时更新统计
        document.getElementById('textInput').addEventListener('input', () => {
            this.updateStats();
        });
        
        // 监听滚动事件，用户手动滚动时禁用自动滚动
        const outputSection = document.getElementById('segmentedText');
        if (outputSection) {
            outputSection.addEventListener('scroll', () => {
                // 用户手动滚动，禁用自动滚动
                this.autoScrollEnabled = false;
                
                // 清除之前的计时器
                if (this.scrollTimer) {
                    clearTimeout(this.scrollTimer);
                }
                
                // 5秒后恢复自动滚动
                this.scrollTimer = setTimeout(() => {
                    this.restoreAutoScroll();
                }, 5000);
                
                // 重置浮动控制栏计时器
                this.resetFloatControlsTimer();
            });
        }
        
        // 添加连续两次双击事件监听
        document.addEventListener('dblclick', (e) => {
            // 只有点击空白区域才触发
            if (e.target.tagName === 'BODY' || e.target.className === 'app-container') {
                this.handleDoubleClick();
            }
        });
        
        // 浮动控制栏事件绑定
        this.initFloatingControls();
    }

    // 初始化波形显示
    initWaveform() {
        const canvas = document.getElementById('waveformCanvas');
        const ctx = canvas.getContext('2d');
        
        // 绘制默认波形
        this.drawDefaultWaveform(ctx, canvas.width, canvas.height);
    }

    // 绘制默认波形
    drawDefaultWaveform(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#ff69b4';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        
        for (let i = 0; i < width; i++) {
            const x = i;
            const y = height / 2 + Math.sin(i * 0.02) * 20;
            ctx.lineTo(x, y);
        }
        
        ctx.stroke();
    }

    // 智能中文分词处理
    processText() {
        const text = document.getElementById('textInput').value.trim();
        if (!text) {
            alert('请输入文本内容');
            return;
        }

        // 基于标点符号和语义的智能分段
        this.segmentedText = this.segmentParagraphs(text);
        
        // 显示分词结果
        this.displaySegmentedText();
        
        // 更新统计信息
        this.updateStats();
    }

    // 基于标点符号和语义的智能分段
    segmentParagraphs(text) {
        // 首先按换行符分段
        let paragraphs = text.split(/[\r\n]+/).filter(p => p.trim());
        
        // 进一步按标点符号分句
        const sentenceEndings = /([。！？；…])/g;
        const segmented = [];
        
        paragraphs.forEach(para => {
            let sentences = para.split(sentenceEndings);
            
            // 重组句子和标点
            for (let i = 0; i < sentences.length; i += 2) {
                if (sentences[i]) {
                    let sentence = sentences[i] + (sentences[i + 1] || '');
                    segmented.push(this.segmentWords(sentence));
                }
            }
        });
        
        return segmented;
    }

    // 中文分词处理（简化版，实际项目可集成更复杂的分词库）
    segmentWords(sentence) {
        // 移除多余空格
        sentence = sentence.replace(/\s+/g, '');
        
        // 简单的中文分词实现，基于常见词语和单字
        // 实际项目中建议使用成熟的分词库如 jieba.js
        const commonWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'];
        const words = [];
        let i = 0;
        
        while (i < sentence.length) {
            let found = false;
            
            // 尝试匹配双字词语
            if (i < sentence.length - 1) {
                const twoChar = sentence.substr(i, 2);
                if (commonWords.includes(twoChar)) {
                    words.push(twoChar);
                    i += 2;
                    found = true;
                }
            }
            
            // 尝试匹配单字词语
            if (!found) {
                const oneChar = sentence.substr(i, 1);
                if (commonWords.includes(oneChar)) {
                    words.push(oneChar);
                } else {
                    // 处理连续的非常用字
                    let j = i + 1;
                    while (j < sentence.length && !commonWords.includes(sentence.substr(j, 1))) {
                        j++;
                    }
                    words.push(sentence.substr(i, j - i));
                    i = j;
                    continue;
                }
                i++;
            }
        }
        
        return {
            text: sentence,
            words: words
        };
    }

    // 显示分词结果
    displaySegmentedText() {
        const container = document.getElementById('segmentedText');
        container.innerHTML = '';
        
        this.segmentedText.forEach((paragraph, index) => {
            const paraElement = document.createElement('div');
            paraElement.className = 'paragraph';
            paraElement.dataset.index = index;
            
            // 添加词语
            paragraph.words.forEach(word => {
                const wordElement = document.createElement('span');
                wordElement.className = 'word';
                wordElement.textContent = word;
                paraElement.appendChild(wordElement);
            });
            
            // 添加点击事件
            paraElement.addEventListener('click', () => {
                this.playFromParagraph(index);
            });
            
            container.appendChild(paraElement);
        });
    }

    // 更新统计信息
    updateStats() {
        const text = document.getElementById('textInput').value;
        const charCount = text.replace(/\s/g, '').length;
        const paragraphCount = this.segmentedText.length;
        
        document.getElementById('charCount').textContent = charCount;
        document.getElementById('paragraphCount').textContent = paragraphCount;
    }

    // 播放语音
    play() {
        if (this.segmentedText.length === 0) {
            alert('请先处理文本');
            return;
        }
        
        if (this.isPlaying) {
            this.speechSynthesis.resume();
        } else {
            this.speakCurrentParagraph();
        }
        
        this.isPlaying = true;
        this.updateFloatPlayBtn();
    }

    // 暂停播放
    pause() {
        if (this.isPlaying) {
            this.speechSynthesis.pause();
            this.isPlaying = false;
            this.updateFloatPlayBtn();
        }
    }

    // 停止播放
    stop() {
        this.speechSynthesis.cancel();
        this.isPlaying = false;
        this.currentParagraph = 0;
        this.updateActiveParagraph();
        this.updateTimeDisplay(0, 0);
        this.updateFloatPlayBtn();
    }

    // 从指定段落开始播放
    playFromParagraph(index) {
        this.stop();
        this.currentParagraph = index;
        this.isPlaying = true;
        this.updateFloatPlayBtn();
        // 异步调用，不需要等待完成
        this.speakCurrentParagraph();
    }

    // 播放当前段落
    speakCurrentParagraph() {
        try {
            // 检查浏览器是否支持语音合成
            if (!('speechSynthesis' in window)) {
                alert('您的浏览器不支持语音合成功能，请使用Chrome 33+、Edge 14+或Safari 7+浏览器');
                this.isPlaying = false;
                this.updateFloatPlayBtn();
                return;
            }
            
            if (this.currentParagraph >= this.segmentedText.length) {
                this.stop();
                return;
            }
            
            // 更新当前活跃段落
            this.updateActiveParagraph();
            
            const paragraph = this.segmentedText[this.currentParagraph].text;
            
            // 简单的语音合成实现，使用浏览器默认语音
            const utterance = new SpeechSynthesisUtterance(paragraph);
            
            // 基本设置
            utterance.lang = 'zh-CN';
            utterance.rate = parseFloat(document.getElementById('rateSlider').value);
            utterance.pitch = parseFloat(document.getElementById('pitchSlider').value);
            utterance.volume = parseFloat(document.getElementById('volumeSlider').value) / 100;
            
            console.log('正在播放段落:', paragraph);
            console.log('语音设置:', {
                lang: utterance.lang,
                rate: utterance.rate,
                pitch: utterance.pitch,
                volume: utterance.volume
            });
            
            // 事件监听
            utterance.onend = () => {
                console.log('段落播放结束');
                this.currentParagraph++;
                this.speakCurrentParagraph();
            };
            
            utterance.onerror = (event) => {
                console.error('语音合成错误:', event.error, '错误事件:', event);
                this.isPlaying = false;
                this.updateFloatPlayBtn();
                
                // 简化的错误提示
                alert('语音合成失败，请尝试：\n1. 刷新页面\n2. 更换浏览器\n3. 检查浏览器语音设置');
            };
            
            // 开始播放
            this.speechSynthesis.speak(utterance);
            
        } catch (error) {
            console.error('语音合成异常:', error);
            this.isPlaying = false;
            this.updateFloatPlayBtn();
            alert(`语音合成发生异常: ${error.message}`);
        }
    }

    // 初始化浮动控制栏
    initFloatingControls() {
        const floatControls = document.getElementById('floatingControls');
        const floatPlayBtn = document.getElementById('floatPlayBtn');
        const floatVolumeUp = document.getElementById('floatVolumeUp');
        const floatVolumeDown = document.getElementById('floatVolumeDown');
        
        // 播放/暂停按钮点击事件
        floatPlayBtn.addEventListener('click', () => {
            if (this.isPlaying) {
                this.pause();
            } else {
                this.play();
            }
            this.resetFloatControlsTimer();
        });
        
        // 音量增加按钮
        floatVolumeUp.addEventListener('click', () => {
            const volumeSlider = document.getElementById('volumeSlider');
            let currentVolume = parseFloat(volumeSlider.value);
            currentVolume = Math.min(100, currentVolume + 10);
            volumeSlider.value = currentVolume;
            document.getElementById('volumeValue').textContent = `${currentVolume}%`;
            this.resetFloatControlsTimer();
        });
        
        // 音量减少按钮
        floatVolumeDown.addEventListener('click', () => {
            const volumeSlider = document.getElementById('volumeSlider');
            let currentVolume = parseFloat(volumeSlider.value);
            currentVolume = Math.max(0, currentVolume - 10);
            volumeSlider.value = currentVolume;
            document.getElementById('volumeValue').textContent = `${currentVolume}%`;
            this.resetFloatControlsTimer();
        });
        
        // 鼠标悬停时展开
        floatControls.addEventListener('mouseenter', () => {
            this.expandFloatControls();
            this.resetFloatControlsTimer();
        });
        
        // 鼠标离开时重置计时器
        floatControls.addEventListener('mouseleave', () => {
            this.resetFloatControlsTimer();
        });
        
        // 初始启动计时器
        this.resetFloatControlsTimer();
    }

    // 重置浮动控制栏计时器
    resetFloatControlsTimer() {
        if (this.floatControlsTimer) {
            clearTimeout(this.floatControlsTimer);
        }
        
        // 展开控制栏
        this.expandFloatControls();
        
        // 5秒后自动折叠
        this.floatControlsTimer = setTimeout(() => {
            this.collapseFloatControls();
        }, 5000);
    }

    // 折叠浮动控制栏
    collapseFloatControls() {
        const floatControls = document.getElementById('floatingControls');
        if (floatControls) {
            floatControls.classList.add('collapsed');
            this.isControlsCollapsed = true;
        }
    }

    // 展开浮动控制栏
    expandFloatControls() {
        const floatControls = document.getElementById('floatingControls');
        if (floatControls) {
            floatControls.classList.remove('collapsed');
            this.isControlsCollapsed = false;
        }
    }

    // 更新浮动播放按钮状态
    updateFloatPlayBtn() {
        const floatPlayBtn = document.getElementById('floatPlayBtn');
        if (floatPlayBtn) {
            floatPlayBtn.textContent = this.isPlaying ? '⏸' : '▶';
        }
    }

    // 检查元素是否在视口中可见
    isElementInViewport(el) {
        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // 恢复自动滚动
    restoreAutoScroll() {
        this.autoScrollEnabled = true;
    }

    // 处理双击事件
    handleDoubleClick() {
        // 清除之前的计时器
        if (this.doubleClickTimer) {
            clearTimeout(this.doubleClickTimer);
        }
        
        // 增加双击计数
        this.doubleClickCount++;
        
        // 设置500ms计时器，检测连续双击
        this.doubleClickTimer = setTimeout(() => {
            if (this.doubleClickCount >= 2) {
                // 连续两次双击，切换智能滚动和高亮功能
                this.toggleSmartScrollAndHighlight();
            }
            // 重置计数
            this.doubleClickCount = 0;
        }, 500);
    }

    // 切换智能滚动和高亮功能
    toggleSmartScrollAndHighlight() {
        // 切换状态
        this.autoScrollEnabled = !this.autoScrollEnabled;
        this.highlightEnabled = !this.highlightEnabled;
        
        // 更新高亮显示
        this.updateHighlightDisplay();
        
        // 显示状态提示
        const status = this.autoScrollEnabled && this.highlightEnabled ? '已开启' : '已关闭';
        alert(`智能滚动和高亮功能 ${status}`);
        
        console.log(`智能滚动和高亮功能已${status}`, {
            autoScrollEnabled: this.autoScrollEnabled,
            highlightEnabled: this.highlightEnabled
        });
    }

    // 更新高亮显示
    updateHighlightDisplay() {
        // 移除所有高亮
        document.querySelectorAll('.paragraph').forEach(para => {
            para.classList.remove('active');
        });
        
        // 如果高亮功能已开启，添加当前段落高亮
        if (this.highlightEnabled) {
            const currentPara = document.querySelector(`[data-index="${this.currentParagraph}"]`);
            if (currentPara) {
                currentPara.classList.add('active');
            }
        }
    }

    // 更新当前活跃段落
    updateActiveParagraph() {
        // 移除所有活跃状态
        document.querySelectorAll('.paragraph').forEach(para => {
            para.classList.remove('active');
        });
        
        // 添加当前活跃状态
        const currentPara = document.querySelector(`[data-index="${this.currentParagraph}"]`);
        if (currentPara) {
            // 只有在高亮功能开启时才添加高亮
            if (this.highlightEnabled) {
                currentPara.classList.add('active');
            }
            
            // 只有在正在播放且自动滚动启用时，才执行自动滚动逻辑
            if (this.isPlaying && this.autoScrollEnabled) {
                // 检查当前段落是否在视口中
                const isVisible = this.isElementInViewport(currentPara);
                
                if (isVisible) {
                    // 如果当前段落已可见，直接滚动
                    currentPara.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    // 如果当前段落不可见，设置5秒后恢复自动滚动
                    if (this.scrollTimer) {
                        clearTimeout(this.scrollTimer);
                    }
                    this.scrollTimer = setTimeout(() => {
                        this.restoreAutoScroll();
                        currentPara.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 5000);
                }
            }
        }
    }

    // 更新时间显示
    updateTimeDisplay(current, duration) {
        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };
        
        document.getElementById('currentTime').textContent = formatTime(current);
        document.getElementById('duration').textContent = formatTime(duration);
    }

    // 加载示例文本
    loadExampleText() {
        const exampleText = `
            且说黛玉自那日弃舟登岸时，便有荣国府打发了轿子并拉行李的车辆久候了。这林黛玉常听得母亲说过，他外祖母家与别家不同。他近日所见的这几个三等仆妇，吃穿用度，已是不凡了，何况今至其家。因此步步留心，时时在意，不肯轻易多说一句话，多行一步路，惟恐被人耻笑了他去。
            自上了轿，进入城中，从纱窗向外瞧了一瞧，其街市之繁华，人烟之阜盛，自与别处不同。又行了半日，忽见街北蹲着两个大石狮子，三间兽头大门，门前列坐着十来个华冠丽服之人。正门却不开，只有东西两角门有人出入。正门之上有一匾，匾上大书“敕造宁国府”五个大字。黛玉想道：这必是外祖之长房了。想着，又往西行，不多远，照样也是三间大门，方是荣国府了。却不进正门，只进了西边角门。那轿夫抬进去，走了一射之地，将转弯时，便歇下退出去了。后面的婆子们已都下了轿，赶上前来。另换了三四个衣帽周全十七八岁的小厮上来，复抬起轿子。众婆子步下围随至一垂花门前落下。众小厮退出，众婆子上来打起轿帘，扶黛玉下轿。林黛玉扶着婆子的手，进了垂花门，两边是抄手游廊，当中是穿堂，当地放着一个紫檀架子大理石的大插屏。转过插屏，小小的三间厅，厅后就是后面的正房大院。正面五间上房，皆雕梁画栋，两边穿山游廊厢房，挂着各色鹦鹉、画眉等鸟雀。台矶之上，坐着几个穿红着绿的丫头，一见他们来了，便忙都笑迎上来，说：“刚才老太太还念呢，可巧就来了。”于是三四人争着打起帘笼，一面听得人回话：“林姑娘到了。”
        `;
        
        document.getElementById('textInput').value = exampleText.trim();
        this.updateStats();
    }

    // 加载文件
    loadFile(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            document.getElementById('textInput').value = e.target.result;
            this.updateStats();
        };
        
        reader.readAsText(file, 'utf-8');
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new ChineseTTSReader();
});