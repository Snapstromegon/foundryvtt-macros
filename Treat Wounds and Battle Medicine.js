/*
Contributed by Mother of God
Maintained and modified by The Macro Fairies
This Macro works just like the system's Treat Wounds macro, except for the following additions:
- Adds the ability to roll with assurance
- Shows the assurance roll result during option selection
- Adds godless healing integration
- Adds Battle Medicine integration
- Removes any skill that is not applicable if you have Chirurgeon and/or Natural Medicine (if you don't have medicine trained)
- Fires off a warning notification if Medicine is not trained and you do not possess a feat/feature that allows you to roll a different skill.
- Adds the ability to use the macro with clever improviser.
*/

/**
 * Check wether the current actor has a feature.
 *
 * @param {string} slug
 * @returns {boolean} true if the feature exists, false otherwise
 */
const checkFeat = (slug) =>
  token.actor.items
    .filter((item) => item.type === 'feat')
    .some((item) => item.data.data.slug === slug);

/**
 * Check if any itemType feat of the actor matches a slug (and optionally a name)
 *
 * @param {string} slug Slug of the feature to search
 * @param {string} name Optional name of the feature
 * @returns {boolean} true if the actor has a meatching item feat
 */
const checkItemTypeFeat = (slug, name) =>
  token.actor.itemTypes.feat.some(
    (feat) => feat.slug === slug && (!name || feat.name === name)
  );

/**
 * Get the available roll options
 *
 * @param {Object} options
 * @param {boolean} options.isRiskySurgery Is this a risky surgery?
 * @returns {string[]} All available roll options
 */
const getRollOptions = ({ isRiskySurgery } = {}) => [
  ...token.actor.getRollOptions(['all', 'skill-check', 'medicine']),
  'treat wounds',
  'action:treat-wounds',
  // This conditionally adds some elements to the available options
  // If there are more cases like this, it might be good to rewrite this with
  // if(...){....push(...)}
  ...(isRiskySurgery ? ['risky-surgery'] : []),
];

/**
 * Get the formula for healing and the success label
 *
 * @param {Object} options
 * @param {0|1|2|3} options.success Level of success
 * @param {boolean} options.hasMagicHands Actor has the feat magic-hands
 * @param {boolean} options.hasMortalHealing Actor has the feat mortal healing
 * @param {boolean} options.isRiskySurgery Actor has the feat mortal healing
 * @param {boolean} options.hasBattleMedicine Actor has the feat battle medicine
 * @param {string} options.bonusString Bonus String for this throw
 * @returns {{healFormula: string, successLabel: string}} Dice heal formula and success label
 */
const getHealSuccess = ({
  success,
  hasMagicHands,
  hasMortalHealing,
  isRiskySurgery,
  hasBattleMedicine,
  bonusString,
}) => {
  let healFormula;
  let successLabel;
  switch (success) {
    case 0:
      healFormula = '1d8';
      successLabel = 'Critical Failure';
      break;
    case 1:
      successLabel = 'Failure';
      break;
    case 2:
      if (isRiskySurgery) {
        healFormula = hasMagicHands ? `32${bonusString}` : `4d8${bonusString}`;
        successLabel = 'Success with risky surgery';
      } else if (hasMortalHealing && !hasBattleMedicine) {
        healFormula = hasMagicHands ? `16${bonusString}` : `4d8${bonusString}`;
        successLabel = 'Success with mortal healing';
      } else {
        healFormula = hasMagicHands ? `16${bonusString}` : `2d8${bonusString}`;
        successLabel = 'Success';
      }
      break;
    case 3:
      healFormula = hasMagicHands ? `32${bonusString}` : `4d8${bonusString}`;
      successLabel = 'Critical Success';
      break;
    default:
      ui.notifications.warn(`Success value of ${success} is not defined.`);
  }
  return {
    healFormula,
    successLabel,
  };
};

/**
 * Perform a roll on treating wounds
 *
 * @param {Object} options
 * @param {number} options.DC
 * @param {number} options.bonus Bonus on this roll
 * @param {number} options.med Medical skill
 * @param {boolean} options.isRiskySurgery Is a risky surgery
 * @param {boolean} options.hasMortalHealing Has mortal healing
 * @param {boolean} options.hasBattleMedicine Is a battle med
 * @param {boolean} options.assurance Has assurance
 * @param {number} options.bmtw bmtw
 */
const rollTreatWounds = async ({
  DC,
  bonus,
  med,
  isRiskySurgery,
  hasMortalHealing,
  hasBattleMedicine,
  assurance,
  bmtw,
}) => {
  const dc = {
    value: DC,
    visibility: 'all',
  };
  if (isRiskySurgery || hasMortalHealing) {
    dc.modifiers = {
      success: 'one-degree-better',
    };
  }

  const hasMagicHands = checkFeat('magic-hands');
  const bonusString = bonus > 0 ? ` + ${bonus}` : '';

  if (assurance) {
    const aroll = await new Roll(
      `${med.modifiers.find((m) => m.type === 'proficiency').modifier} + 10`
    ).roll({ async: true });
    ChatMessage.create({
      user: game.user.id,
      type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      flavor: `<strong>Assurance ${
        med.name[0].toUpperCase() + med.name.substring(1)
      }</strong> vs DC ${DC}`,
      roll: aroll,
      speaker: ChatMessage.getSpeaker(),
    });

    const atot = aroll.total - DC;

    const success = atot >= 10 ? 3 : atot >= 0 ? 2 : atot <= -10 ? 0 : 1;

    const { healFormula, successLabel } = getHealSuccess({
      success,
      hasMagicHands,
      hasMortalHealing,
      isRiskySurgery,
      hasBattleMedicine,
      bonusString,
    });

    if (isRiskySurgery) {
      ChatMessage.create({
        user: game.user.id,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        flavor: `<strong>Damage Roll: Risky Surgery</strong>`,
        roll: await new Roll('{1d8}[slashing]').roll({ async: true }),
        speaker: ChatMessage.getSpeaker(),
      });
    }
    if (healFormula !== undefined) {
      const rollType = success > 1 ? 'Healing' : 'Damage';
      const healRoll = await new Roll(`{${healFormula}}[${rollType}]`).roll({
        async: true,
      });
      ChatMessage.create({
        user: game.user.id,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        flavor: `<strong>${rollType} Roll: ${bmtw}</strong> (${successLabel})`,
        roll: healRoll,
        speaker: ChatMessage.getSpeaker(),
      });
    }
  } else {
    med.roll({
      dc: dc,
      event: event,
      options: getRollOptions({ isRiskySurgery: isRiskySurgery }),
      callback: async (roll) => {
        const { healFormula, successLabel } = getHealSuccess({
          success: roll.data.degreeOfSuccess,
          hasMagicHands,
          hasMortalHealing,
          isRiskySurgery,
          hasBattleMedicine,
          bonusString,
        });
        if (isRiskySurgery) {
          ChatMessage.create({
            user: game.user.id,
            type: CONST.CHAT_MESSAGE_TYPES.ROLL,
            flavor: `<strong>Damage Roll: Risky Surgery</strong>`,
            roll: await new Roll('{1d8}[slashing]').roll({ async: true }),
            speaker: ChatMessage.getSpeaker(),
          });
        }
        if (healFormula !== undefined) {
          const rollType = roll.data.degreeOfSuccess > 1 ? 'Healing' : 'Damage';
          const healRoll = await new Roll(`{${healFormula}}[${rollType}]`).roll(
            { async: true }
          );
          ChatMessage.create({
            user: game.user.id,
            type: CONST.CHAT_MESSAGE_TYPES.ROLL,
            flavor: `<strong>${rollType} Roll: ${bmtw}</strong> (${successLabel})`,
            roll: healRoll,
            speaker: ChatMessage.getSpeaker(),
          });
        }
      },
    });
  }
};

async function applyChanges($html) {
  for (const token of canvas.tokens.controlled) {
    var med = token.actor.data.data.skills.med;
    if (!med) {
      ui.notifications.warn(
        `Token ${token.name} does not have the medicine skill`
      );
      continue;
    }
    const { name } = token;
    const level = token.actor.data.data.details.level.value;
    const mod = parseInt($html.find('[name="modifier"]').val()) || 0;
    const assurance = $html.find('[name="assurance_bool"]')[0]?.checked;
    const requestedProf =
      parseInt($html.find('[name="dc-type"]')[0].value) || 1;
    const hasBattleMedicine =
      parseInt($html.find('[name="hasBattleMedicine"]')[0]?.value) === 1;
    const isRiskySurgery = $html.find('[name="risky_surgery_bool"]')[0]
      ?.checked;
    const hasMortalHealing = $html.find('[name="mortal_healing_bool"]')[0]
      ?.checked;
    const hasGodlessHealing = $html.find('[name="godless_healing_bool"]')[0]
      ?.checked;
    const forensicMedicine = checkFeat('forensic-medicine-methodology');

    const skill = $html.find('[name="skill"]')[0]?.value;

    // Handle Rule Interpretation
    if (game.user.isGM) {
      await game.settings.set(
        'pf2e',
        'RAI.TreatWoundsAltSkills',
        $html.find('[name="strict_rules"]')[0]?.checked
      );
    }

    let usedProf = 0;
    if (game.settings.get('pf2e', 'RAI.TreatWoundsAltSkills')) {
      if (skill === 'cra') {
        med = token.actor.data.data.skills['cra'];
      }
      if (skill === 'nat') {
        med = token.actor.data.data.skills['nat'];
      }
      usedProf = requestedProf <= med.rank ? requestedProf : med.rank;
    } else {
      usedProf = requestedProf <= med.rank ? requestedProf : med.rank;
      if (skill === 'cra') {
        med = token.actor.data.data.skills['cra'];
      }
      if (skill === 'nat') {
        med = token.actor.data.data.skills['nat'];
        if (usedProf === 0) {
          usedProf = 1;
        }
      }
    }
    if (checkItemTypeFeat('clever-improviser') && usedProf === 0) {
      usedProf = 1;
    }
    const medicBonus = checkFeat('medic-dedication') ? (usedProf - 1) * 5 : 0;
    const hasBattleMedicineBonus = hasBattleMedicine * level * forensicMedicine;
    const godlessHealingBonus = hasGodlessHealing ? 5 : 0;

    const bmtw = hasBattleMedicine ? 'Battle Medicine' : 'Treat Wounds';

    switch (usedProf) {
      case 0:
        ui.notifications.warn(
          `${name} is not trained in Medicine and doesn't know how to ${bmtw}.`
        );
        break;
      case 1:
        rollTreatWounds({
          DC: 15 + mod,
          bonus: 0 + medicBonus + godlessHealingBonus + hasBattleMedicineBonus,
          med,
          isRiskySurgery,
          hasMortalHealing,
          hasBattleMedicine,
          assurance,
          bmtw,
        });
        break;
      case 2:
        rollTreatWounds({
          DC: 20 + mod,
          bonus: 10 + medicBonus + godlessHealingBonus + hasBattleMedicineBonus,
          med,
          isRiskySurgery,
          hasMortalHealing,
          hasBattleMedicine,
          assurance,
          bmtw,
        });
        break;
      case 3:
        rollTreatWounds({
          DC: 30 + mod,
          bonus: 30 + medicBonus + godlessHealingBonus + hasBattleMedicineBonus,
          med,
          isRiskySurgery,
          hasMortalHealing,
          hasBattleMedicine,
          assurance,
          bmtw,
        });
        break;
      case 4:
        rollTreatWounds({
          DC: 40 + mod,
          bonus: 50 + medicBonus + godlessHealingBonus + hasBattleMedicineBonus,
          med,
          isRiskySurgery,
          hasMortalHealing,
          hasBattleMedicine,
          assurance,
          bmtw,
        });
        break;
      default:
        ui.notifications.warn(
          `${name} has an invalid usedProf value of ${usedProf}.`
        );
    }
  }
}

/**
 * Render the content for the dialog
 *
 * @param {Object} options
 * @param {boolean} options.hasChirurgeon Is the actor a chirurgeon
 * @param {boolean} options.hasNaturalMedicine Does the actor have natural medicine
 * @param {boolean} options.hasBattleMedicine Does the actor have battle medicine
 * @param {boolean} options.tmed Does the actor have medicine
 * @param {number} options.totalAssurance Assurance of the actor
 * @returns {string} The Dialog content
 */
const renderDialogContent = ({
  hasChirurgeon,
  hasNaturalMedicine,
  hasBattleMedicine,
  tmed,
  totalAssurance,
}) => `
  <div>
    Attempt to heal the target by 2d8 hp.<br>You have to hold healer's tools, or you are wearing them and have a hand free!
  </div>
  <hr/>
  ${
    hasChirurgeon || hasNaturalMedicine
      ? `<form>
          <div class="form-group">
          <label>Treat Wounds Skill:</label>
            <select id="skill" name="skill">
              ${tmed ? `<option value="med">Medicine</option>` : ``}
              ${hasChirurgeon ? `<option value="cra">Crafting</option>` : ``}
              ${hasNaturalMedicine ? `<option value="nat">Nature</option>` : ``}
            </select>
          </div>
        </form>`
      : ''
  }
  <form>
      <div class="form-group">
          <select id="hasBattleMedicine" name="hasBattleMedicine">
              ${
                hasBattleMedicine
                  ? '<option value="1">Battle Medicine</option>'
                  : ''
              }
              <option value="0">Treat Wounds</option>
          </select>
      </div>
  </form>
  ${
    (hasChirurgeon &&
      (checkItemTypeFeat('assurance', 'Assurance (Crafting)') ||
        checkItemTypeFeat('assurance-crafting'))) ||
    (hasNaturalMedicine &&
      (checkItemTypeFeat('assurance', 'Assurance (Nature)') ||
        checkItemTypeFeat('assurance-nature'))) ||
    checkItemTypeFeat('assurance', 'Assurance (Medicine)') ||
    checkItemTypeFeat('assurance-medicine')
      ? `<form>
      <div class="form-group">
          <label>Use Assurance? <small>This will beat DC ${totalAssurance}</small></label>
          <input type="checkbox" id="assurance_bool" name="assurance_bool"></input>
      </div>
  </form>`
      : ``
  }
  <form>
      <div class="form-group">
          <label>Medicine DC:</label>
          <select id="dc-type" name="dc-type">
              <option value="1" selected>Trained DC 15</option>
              <option value="2">Expert DC 20, +10 Healing</option>
              <option value="3">Master DC 30, +30 Healing</option>
              <option value="4">Legendary DC 40, +50 Healing</option>
          </select>
      </div>
  </form>
  <form>
      <div class="form-group">
          <label>DC Modifier:</label>
          <input id="modifier" name="modifier" type="number"/>
      </div>
  </form>
  <form>
    <div class="form-group">
      <label>Godless Healing</label>
      <input type="checkbox" id="godless_healing_bool" name="godless_healing_bool"></input>
    </div>
  </form>
  ${
    checkFeat('risky-surgery')
      ? `<form>
          <div class="form-group">
            <label>Risky Surgery</label>
            <input type="checkbox" id="risky_surgery_bool" name="risky_surgery_bool"></input>
          </div>
        </form>`
      : ``
  }
  ${
    checkFeat('mortal-healing')
      ? `<form>
          <div class="form-group">
            <label>Mortal Healing</label>
            <input type="checkbox" id="mortal_healing_bool" name="mortal_healing_bool" checked></input>
          </div>
        </form>`
      : ``
  }
  ${
    game.user.isGM
      ? `<form>
          <div class="form-group">
            <label>Allow higher DC from alternate skills?</label>
            <input type="checkbox" id="strict_rules" name="strict_rules"${
              game.settings.get('pf2e', 'RAI.TreatWoundsAltSkills')
                ? ` checked`
                : ``
            }
            ></input>
          </div>
        </form>`
      : ``
  }
  </form>
`;

if (token === undefined) {
  ui.notifications.warn('No token is selected.');
} else {
  const hasChirurgeon = checkFeat('chirurgeon');
  const hasNaturalMedicine = checkFeat('natural-medicine');
  const hasBattleMedicine = checkFeat('battle-medicine');
  let tmed = token.actor.data.data.skills['med'].rank > 0;
  if (
    !tmed &&
    !hasChirurgeon &&
    !hasNaturalMedicine &&
    !checkItemTypeFeat('clever-improviser')
  ) {
    ui.notifications.warn(
      'Medicine is not trained and you do not possess a feat or feature to use another skill'
    );
  } else {
    const { med } = token.actor.data.data.skills;
    const level = token.actor.data.data.details.level.value;
    const totalAssurance = 10 + (med.rank * 2 + level);
    const dialog = new Dialog({
      title: 'Treat Wounds',
      content: renderDialogContent({
        hasChirurgeon,
        hasNaturalMedicine,
        hasBattleMedicine,
        tmed,
        totalAssurance,
      }),
      buttons: {
        yes: {
          icon: `<i class="fas fa-hand-holding-medical"></i>`,
          label: 'Treat Wounds',
          callback: applyChanges,
        },
        no: {
          icon: `<i class="fas fa-times"></i>`,
          label: 'Cancel',
        },
      },
      default: 'yes',
    });
    dialog.render(true);
  }
}
