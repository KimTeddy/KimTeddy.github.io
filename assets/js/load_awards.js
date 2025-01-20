document.addEventListener('DOMContentLoaded', () => {
    const MAX_RETRIES = 3; // 최대 재시도 횟수
    let retryCount = 0;

    const loadAwards = () => {
        fetch('assets/data/awards.yaml')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.text();
            })
            .then(yamlText => {
                const awardsData = jsyaml.load(yamlText); // YAML 파싱
                const awardContainer = document.querySelector('.award-container');

                if (!awardContainer) {
                    throw new Error('Container element .award-container is missing.');
                }

                // Clear existing content to prevent duplication during retries
                awardContainer.innerHTML = '';

                // 상별 이모티콘 매핑
                const awardIcons = {
                    "대상": "🏆",
                    "최우수상": "🏆",
                    "우수상": "🏅",
                    "금상": "🥇",
                    "은상": "🥈",
                    "동상": "🥉",
                    "입선": "✨",
                    "장려상": "✨",
                    "포스터상": "📜"
                };

                if (awardsData.awards) {
                    awardsData.awards.forEach(award => {
                        const awardCard = document.createElement('div');
                        awardCard.className = 'award-card';
                        awardCard.classList.add('cards');  // 클래스 추가
                        awardCard.style.display = 'block';

                        // 연도 추가
                        const year = document.createElement('h3');
                        year.textContent = award.year;
                        awardCard.appendChild(year);

                        // 대회 및 수상 내역 처리
                        if (award.competitions) {
                            award.competitions.forEach(comp => {
                                const competitionRow = document.createElement('div');
                                competitionRow.className = 'competition-row';

                                // 대회명 추가
                                const compTitle = document.createElement('span');
                                compTitle.className = 'competition-title';
                                compTitle.textContent = comp.name;

                                // 수상 내역 추가
                                const awardList = document.createElement('span');
                                awardList.className = 'award-list';
                                let awardText = '';

                                comp.awards.forEach(award => {
                                    const icon = awardIcons[award.type] || "✨"; // 기본 이모티콘 설정

                                    if (award.count && award.count > 1) {
                                        awardText += `<code>${icon}${award.type}(${award.count})</code> `;
                                    } else {
                                        awardText += `<code>${icon}${award.type}</code> `;
                                    }
                                });

                                awardList.innerHTML = awardText.trim();

                                competitionRow.appendChild(compTitle);
                                competitionRow.appendChild(awardList);
                                awardCard.appendChild(competitionRow);
                            });
                        }

                        awardContainer.appendChild(awardCard);
                    });
                } else {
                    console.error('No awards found in YAML data.');
                }
            })
            .catch(error => {
                console.error(`Error loading YAML (Attempt ${retryCount + 1}):`, error);
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    console.log(`Retrying... (${retryCount}/${MAX_RETRIES})`);
                    setTimeout(loadAwards, 2000); // 재시도
                } else {
                    const awardContainer = document.querySelector('.award-container');
                    if (awardContainer) {
                        awardContainer.innerHTML = '<p>Error loading awards. Please try again later.</p>';
                    }
                }
            });
    };

    loadAwards(); // 첫 로드 시도
});
