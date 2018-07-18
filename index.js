/**
 * This is the entry point for your Probot App.
 * @param {import('probot').Application} app - Probot's Application class.
 */
module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!');

  app.on('issues.opened', async context => {
    const issueComment = context.issue({ body: 'Thanks for opening this issue!' });

    return context.github.issues.createComment(issueComment);
  })

  app.on(['pull_request.opened','pull_request.reopened' , 'pull_request.edited'], async context => {
    const params = context.issue();
    const {owner, repo, number} = params;

    const rulesFile = await context.github.repos.getContent({owner, repo, path: '.github/PR_CHECKLIST.json'});
    const rules = JSON.parse(Buffer.from(rulesFile.data.content, 'base64').toString()).rules;


    const files = (await context.github.pullRequests.getFiles({owner, repo, number})).data.map(_ => _.filename);

   const matchingRules = rules.filter(rule => {
      const regexp = new RegExp(rule.pattern);

      return files.some(file => regexp.test(file));
   });

   const messages = [ '# Code Review Checklist' ];

   matchingRules.forEach(rule => {

     messages.push('## ' + rule.name);

     rule.checks.forEach(check => messages.push(`- [ ] ${check}`));
   });

    const prComment = context.issue({ body: messages.join('\n')});

    await context.github.issues.createComment(prComment);


    const sha = context.payload.pull_request.head.sha;

    return context.github.repos
    .createStatus({ owner, repo, sha, state: 'pending', context: 'Code Review', description: 'Checklist' });
  })

  app.on('issue_comment', async context => {

    if (context.payload.action === 'edited') {
      const body = context.payload.comment.body;

      // if this is an update to the code review checklist
      // and all the checkboxes are GTG let's add a happy picture of
      // bill clinton
      if (body.includes('Code Review Checklist')) {
        const {owner, repo, number} = context.issue();

        const checklistComplete = !body.includes('[ ]');

        if (checklistComplete) {
          console.log('Code Review Checklist is Green');
          const message = [];
          message.push('# Ur Good to Go!');
          // message.push(image('Billy Boy', 'https://media.giphy.com/media/l2JJrEx9aRsjNruhi/giphy.gif'));
          const params = context.issue({body: message.join('')});

          context.github.issues.createComment(params);
        }

        // Set the checklist status to green
        const pr = await context.github.pullRequests.get({owner, repo, number});
        const sha = pr.data.head.sha;
        context.github.repos.createStatus({
          owner,
          repo,
          sha,
          state: checklistComplete ? 'success' : 'pending',
          context: 'Code Review',
          description: 'Checklist'
        });

      }

    }

  });
}
